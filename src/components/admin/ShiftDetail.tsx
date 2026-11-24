'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SlotType, AssignmentStatus } from '@/types';
import { NO_ROLE, SLOT_TYPE_LABEL } from '@/types';
import { rolesForSlotType } from '@/lib/role-assignment';
import {
  addDays,
  daysBetween,
  deadlineDateJst,
  formatDateJa,
  formatDateTimeJst,
  formatDeadlineJst,
  formatTimeRange,
} from '@/lib/datetime';
import TargetUserSelector, {
  type SelectableUser,
} from './TargetUserSelector';
import TimeSelect from '../ui/TimeSelect';
import StatusBadge from '../ui/StatusBadge';
import ConfirmDialog from '../ui/ConfirmDialog';

type Slot = {
  id: string;
  slot_type: SlotType;
  date: string;
  start_time: string;
  end_time: string;
  deadline: string;
  // 締切済みか（サーバーが判定。古い API では返らないので省略可）
  expired?: boolean;
  assignment_status: AssignmentStatus;
  // title 列を追加する前の DB では返ってこないので省略可にしている
  title?: string | null;
  note: string | null;
};
type Target = {
  id: string;
  name: string;
  day_roles: string[];
  training_roles: string[];
  available: boolean | null;
  note: string | null;
  submitted: boolean;
  is_active: boolean;
};
type RoleReq = { role: string; required_count: number };
type Assignment = {
  user_id: string;
  name: string;
  role: string;
  is_active: boolean;
};
type Absence = {
  user_id: string;
  name: string;
  reason: string;
  created_at: string;
};
type Detail = {
  slot: Slot;
  targets: Target[];
  role_requirements: RoleReq[];
  assignments: Assignment[];
  // 010 を適用する前の API では返ってこないので省略可
  absences?: Absence[];
};

// 確認ダイアログの中身。種類ごとに文面と「はい」のボタンが違う
type Confirming =
  | { kind: 'assign'; lines: string[] }
  | { kind: 'publish'; lines: string[]; leaving: string[] }
  | { kind: 'swap'; lines: string[] }
  | { kind: 'reset' }
  | { kind: 'delete' };

function sameAssignments(a: Assignment[], b: Assignment[]): boolean {
  if (a.length !== b.length) return false;
  const m = new Map(b.map((x) => [x.user_id, x.role]));
  return a.every((x) => m.get(x.user_id) === x.role);
}

// 管理: シフト枠の詳細。
// 2026-11-24 見直し: 上から作業の順番（欠席連絡 → 提出状況 → 割り振り〈必要人数つき〉→ 基本情報・削除）。
// 提出状況・割り振りに集計と不足を出し、未保存の手直しには印と離脱確認を付けた。
export default function ShiftDetail({ shiftId }: { shiftId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 操作結果の知らせ（通知できなかった人など）。消えると困るので自動では消さない
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);

  // 編集用 state
  const [reqs, setReqs] = useState<Record<string, number>>({});
  const [editAssign, setEditAssign] = useState<Assignment[]>([]);
  // 確定後の差し替え中か（published のときだけ使う）
  const [swapping, setSwapping] = useState(false);

  // 対象者編集
  const [users, setUsers] = useState<SelectableUser[]>([]);
  const [editTargets, setEditTargets] = useState(false);
  const [targetSel, setTargetSel] = useState<Set<string>>(new Set());

  // 基本情報（日付・時間・提出期限・タイトル・備考）の編集
  const [editInfo, setEditInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({
    date: '',
    start_time: '',
    end_time: '',
    deadline_date: '',
    title: '',
    note: '',
  });

  const load = useCallback(async () => {
    const res = await fetch(`/api/shifts/${shiftId}`);
    if (res.status === 401) {
      router.push('/admin');
      return;
    }
    if (!res.ok) {
      setError('読み込みに失敗しました');
      setLoading(false);
      return;
    }
    const data: Detail = await res.json();
    setDetail(data);
    setReqs(
      Object.fromEntries(data.role_requirements.map((r) => [r.role, r.required_count]))
    );
    setEditAssign(data.assignments);
    setTargetSel(new Set(data.targets.map((t) => t.id)));
    setLoading(false);
  }, [shiftId, router]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  // 未保存の手直し（割り振り・必要人数）
  const assignDirty = detail ? !sameAssignments(editAssign, detail.assignments) : false;
  const reqsDirty = detail
    ? rolesForSlotType(detail.slot.slot_type).some(
        (r) =>
          (reqs[r] ?? 0) !==
          (detail.role_requirements.find((x) => x.role === r)?.required_count ?? 0)
      )
    : false;
  const dirty = assignDirty || reqsDirty;

  // 未保存のままページを離れようとしたら確かめる（再読み込み・タブを閉じる・アプリ内のリンク）
  useEffect(() => {
    if (!dirty) return;
    const message = '保存していない変更があります。このページを離れますか？';
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    // Next の <Link> は beforeunload を通らないので、リンクのクリックを先に拾って確かめる
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest('a[href]');
      if (!a || (a as HTMLAnchorElement).target === '_blank') return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  // API 呼び出しの共通処理
  async function call(
    url: string,
    method: string,
    body?: unknown
  ): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? '操作に失敗しました');
        return null;
      }
      return data as Record<string, unknown>;
    } catch {
      setError('通信エラーが発生しました');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveReqs(): Promise<boolean> {
    const role_requirements = Object.entries(reqs).map(([role, required_count]) => ({
      role,
      required_count,
    }));
    return !!(await call(`/api/shifts/${shiftId}`, 'PATCH', { role_requirements }));
  }

  async function runAssign() {
    setConfirming(null);
    // 必要人数を直していたら、先に保存してから割り振る（割り振りは保存済みの人数を使う）
    if (reqsDirty && !(await saveReqs())) return;
    if (await call('/api/assignments', 'POST', { shift_slot_id: shiftId })) await load();
  }

  async function saveChanges() {
    if (reqsDirty && !(await saveReqs())) return;
    if (assignDirty) {
      const assignments = editAssign.map((a) => ({ userId: a.user_id, role: a.role }));
      if (!(await call(`/api/assignments/${shiftId}`, 'PATCH', { assignments }))) return;
    }
    await load();
  }

  async function publish() {
    setConfirming(null);
    setNotice(null);
    if (reqsDirty && !(await saveReqs())) return;
    // 手直しを保存してから公開する
    const assignments = editAssign.map((a) => ({ userId: a.user_id, role: a.role }));
    if (!(await call(`/api/assignments/${shiftId}`, 'PATCH', { assignments }))) return;
    const result = await call(`/api/assignments/${shiftId}/publish`, 'POST');
    if (!result) return;
    const inactive = Array.isArray(result.inactive) ? (result.inactive as string[]) : [];
    if (inactive.length > 0) {
      setNotice(
        `脱退した人が割り振りに含まれていたため、その人には通知していません: ${inactive.join('・')}`
      );
    }
    await load();
  }

  // 確定後の差し替え。変更点を確認ダイアログに出す
  function swapLines(): string[] {
    if (!detail) return [];
    const before = new Map(detail.assignments.map((a) => [a.user_id, a]));
    const after = new Map(editAssign.map((a) => [a.user_id, a]));
    const lines: string[] = [];
    for (const a of editAssign) {
      const b = before.get(a.user_id);
      if (!b) lines.push(`追加: ${a.name}（${a.role}）`);
      else if (b.role !== a.role) lines.push(`役割変更: ${a.name}（${b.role} → ${a.role}）`);
    }
    for (const b of detail.assignments) {
      if (!after.has(b.user_id)) lines.push(`外す: ${b.name}（${b.role}）`);
    }
    return lines;
  }

  async function saveSwap() {
    setConfirming(null);
    if (reqsDirty && !(await saveReqs())) return;
    // 必要人数だけ直したときは差し替え（＝LINE）は送らない
    if (!assignDirty) {
      setSwapping(false);
      await load();
      return;
    }
    const assignments = editAssign.map((a) => ({ userId: a.user_id, role: a.role }));
    const result = await call(`/api/assignments/${shiftId}/swap`, 'POST', { assignments });
    if (!result) return;
    const unnotified = Array.isArray(result.unnotified) ? (result.unnotified as string[]) : [];
    setNotice(
      unnotified.length > 0
        ? `差し替えました。LINE で知らせられなかった人がいます（直接伝えてください）: ${unnotified.join('・')}`
        : `差し替えました。変更があった ${Number(result.notified ?? 0)} 人に LINE で知らせました。`
    );
    setSwapping(false);
    await load();
  }

  function cancelEdits() {
    if (!detail) return;
    setEditAssign(detail.assignments);
    setReqs(
      Object.fromEntries(detail.role_requirements.map((r) => [r.role, r.required_count]))
    );
    setSwapping(false);
  }

  async function reset() {
    setConfirming(null);
    if (await call(`/api/assignments/${shiftId}/reset`, 'POST')) {
      setSwapping(false);
      await load();
    }
  }

  async function loadUsers() {
    const res = await fetch('/api/users');
    if (res.ok) setUsers((await res.json()).users ?? []);
  }

  async function saveTargets() {
    if (
      await call(`/api/shifts/${shiftId}/targets`, 'PUT', {
        user_ids: Array.from(targetSel),
      })
    ) {
      setEditTargets(false);
      await load();
    }
  }

  async function saveInfo() {
    if (infoForm.start_time >= infoForm.end_time) {
      setError('開始時刻は終了時刻より前にしてください');
      return;
    }
    if (!infoForm.deadline_date) {
      setError('提出期限を入力してください');
      return;
    }
    if (infoForm.deadline_date > infoForm.date) {
      setError('提出期限はシフトの日付より後にできません');
      return;
    }
    const title = infoForm.title.trim();
    if (
      await call(`/api/shifts/${shiftId}`, 'PATCH', {
        date: infoForm.date,
        start_time: infoForm.start_time,
        end_time: infoForm.end_time,
        deadline_date: infoForm.deadline_date,
        // 変えていないときは送らない（title 列が無い DB でも他の項目は保存できるように）
        ...(title !== (detail?.slot.title ?? '') ? { title: title || null } : {}),
        note: infoForm.note || null,
      })
    ) {
      setEditInfo(false);
      await load();
    }
  }

  async function deleteSlot() {
    setConfirming(null);
    if (await call(`/api/shifts/${shiftId}`, 'DELETE')) router.push('/admin/shifts');
  }

  if (loading) return <p className="text-sm text-gray-500">読み込み中…</p>;
  if (!detail) return <p className="text-sm text-red-600">{error ?? 'エラー'}</p>;

  const { slot, targets } = detail;
  const absences = detail.absences ?? [];
  const absentIds = new Set(absences.map((a) => a.user_id));
  // 欠席連絡を出した人が、保存済みの確定割り振りから外れていれば「対応済み」
  const savedAssignedIds = new Set(detail.assignments.map((a) => a.user_id));
  const isResolved = (userId: string) =>
    slot.assignment_status === 'published' && !savedAssignedIds.has(userId);
  const roles = rolesForSlotType(slot.slot_type);
  const status = slot.assignment_status;
  const assignedIds = new Set(editAssign.map((a) => a.user_id));
  const expired = slot.expired === true;

  // 提出状況の集計（M4）。脱退した人は数えない
  const activeTargets = targets.filter((t) => t.is_active);
  const inactiveCount = targets.length - activeTargets.length;
  const countYes = activeTargets.filter((t) => t.submitted && t.available).length;
  const countNo = activeTargets.filter((t) => t.submitted && !t.available).length;
  const countMissing = activeTargets.filter((t) => !t.submitted).length;
  // 表は ○ → 未提出 → × → 脱退 の順（割り振りに使える人から見られるように）
  const targetOrder = (t: Target) =>
    !t.is_active ? 3 : !t.submitted ? 1 : t.available ? 0 : 2;
  const sortedTargets = [...targets].sort((a, b) => targetOrder(a) - targetOrder(b));

  // 追加候補: ○ → 未提出 → × の順（差し替えでは × の人も入れられるようにしている）
  const availabilityOrder = (t: Target) => (t.available === true ? 0 : t.available === null ? 1 : 2);
  const availableToAdd = targets
    .filter((t) => !assignedIds.has(t.id) && t.is_active)
    .sort((a, b) => availabilityOrder(a) - availabilityOrder(b));

  // 役割ごとの 必要 / 割り当て（M5）
  const assignedCount = (role: string) => editAssign.filter((a) => a.role === role).length;
  const shortRoles = roles.filter((r) => assignedCount(r) < (reqs[r] ?? 0));

  // 割り振りを手で直せる状態か（調整中、または確定後に差し替え中）
  const editable = status === 'draft' || (status === 'published' && swapping);
  // 必要人数を直せる状態か（確定後は差し替え中のときだけ）
  const reqsEditable = status !== 'published' || swapping;
  const deadlineDate = deadlineDateJst(slot.deadline);

  function addMember(userId: string) {
    const t = targets.find((x) => x.id === userId);
    if (!t) return;
    // 役割は足りていない役割を優先して入れる（あとで変えられる）
    const role = shortRoles[0] ?? roles[0];
    setEditAssign([...editAssign, { user_id: t.id, name: t.name, role, is_active: true }]);
  }

  function askAssign() {
    const lines: string[] = [];
    if (!expired) lines.push(`まだ提出期限前です（${formatDeadlineJst(slot.deadline)} まで）。`);
    if (countMissing > 0) lines.push(`未提出の人が ${countMissing} 人います。`);
    if (lines.length === 0) void runAssign();
    else setConfirming({ kind: 'assign', lines });
  }

  function askPublish() {
    const leaving = editAssign.filter((a) => !a.is_active).map((a) => a.name);
    const lines = roles
      .filter((r) => (reqs[r] ?? 0) > 0 || assignedCount(r) > 0)
      .map((r) => `${r}: ${assignedCount(r)} / ${reqs[r] ?? 0} 人`);
    const noRole = assignedCount(NO_ROLE);
    if (noRole > 0) lines.push(`${NO_ROLE}: ${noRole} 人`);
    setConfirming({ kind: 'publish', lines, leaving });
  }

  function askSwap() {
    const lines = swapLines();
    if (lines.length === 0 && !reqsDirty) {
      setNotice('変更はありません');
      setSwapping(false);
      return;
    }
    setConfirming({ kind: 'swap', lines });
  }

  const dialog = (() => {
    if (!confirming) return null;
    switch (confirming.kind) {
      case 'assign':
        return {
          title: '自動割り振りを実行しますか？',
          body: (
            <ul className="list-disc pl-5">
              {confirming.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
              <li>あとから提出した人は、割り振りを破棄してやり直すか、手で追加してください。</li>
            </ul>
          ),
          confirm: 'このまま割り振る',
          onConfirm: runAssign,
        };
      case 'publish':
        return {
          title: '確定してスタッフに知らせますか？',
          body: (
            <>
              <p>割り振りをスタッフの画面に公開し、LINE で知らせます。</p>
              <ul className="mt-2 list-disc pl-5">
                {confirming.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              {shortRoles.length > 0 && (
                <p className="mt-2 font-bold text-amber-700">
                  ⚠ 足りない役割があります: {shortRoles.join('・')}
                </p>
              )}
              {confirming.leaving.length > 0 && (
                <p className="mt-2 font-bold text-amber-700">
                  ⚠ 脱退した人が残っています: {confirming.leaving.join('・')}
                  （名簿に名前が残りますが、本人には通知されません。外すなら「やめる」を押して「外す」で外してください）
                </p>
              )}
            </>
          ),
          confirm: '確定して知らせる',
          onConfirm: publish,
        };
      case 'swap':
        return {
          title: 'この内容で差し替えますか？',
          body: (
            <>
              {confirming.lines.length > 0 ? (
                <ul className="list-disc pl-5">
                  {confirming.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              ) : (
                <p>必要人数だけを変更します。</p>
              )}
              <p className="mt-2">LINE は変更があった人にだけ届きます。</p>
            </>
          ),
          confirm: '差し替えて知らせる',
          onConfirm: saveSwap,
        };
      case 'reset':
        return {
          title: '割り振りを破棄しますか？',
          body: (
            <p>
              割り振りをすべて消して「受付中」に戻します。
              {status === 'published' &&
                ' 確定済みの割り振りもスタッフの画面から消えます（LINE では知らせません）。'}
            </p>
          ),
          confirm: '破棄する',
          danger: true,
          onConfirm: reset,
        };
      case 'delete':
        return {
          title: 'このシフト枠を削除しますか？',
          body: <p>提出・割り振りも一緒に消えます。元に戻せません。</p>,
          confirm: '削除する',
          danger: true,
          onConfirm: deleteSlot,
        };
    }
  })();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {/* ヘッダー */}
      <div>
        <Link href="/admin/shifts" className="text-sm text-gray-500 underline">
          ← シフト一覧
        </Link>
        <div className="mt-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">
              {formatDateJa(slot.date)}
              {slot.title ? ` ${slot.title}` : ''}
            </h1>
            <p className="text-sm text-gray-600">
              {formatTimeRange(slot.start_time, slot.end_time)}・{SLOT_TYPE_LABEL[slot.slot_type]}
              {slot.note ? ` / ${slot.note}` : ''}
            </p>
            <p className="text-xs text-gray-500">
              提出期限 {formatDeadlineJst(slot.deadline)}
              {expired && '（締切済み）'}
            </p>
          </div>
          <StatusBadge status={status} expired={expired} className="text-sm" />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800">
          {notice}
        </p>
      )}

      {/* 欠席連絡（提出期限後に本人が出したもの）。割り振りは自動では外さない */}
      {absences.length > 0 && (
        <section className="rounded border border-red-300 bg-red-50 p-4">
          <h2 className="font-bold text-red-900">欠席連絡 {absences.length} 件</h2>
          <p className="mt-1 text-xs text-red-800">
            提出期限のあとに届いた連絡です。割り振りからは自動で外れていないので、必要なら下の割り振りで外してください。
          </p>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {absences.map((a) => (
              <li key={a.user_id} className="rounded bg-white p-2">
                <span className="font-bold">{a.name}</span>
                {isResolved(a.user_id) && <ResolvedBadge />}
                <span className="ml-2 text-xs text-gray-500">
                  {formatDateTimeJst(a.created_at)}
                </span>
                <p className="whitespace-pre-wrap text-gray-700">理由: {a.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 提出状況 */}
      <section className="rounded border bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">
            提出状況
            <span className="ml-2 text-sm font-normal">
              <span className="text-green-700">○ {countYes}</span>
              {' / '}
              <span className="text-red-700">× {countNo}</span>
              {' / '}
              <span className={countMissing > 0 ? 'font-bold text-amber-700' : 'text-gray-500'}>
                未提出 {countMissing}
              </span>
              <span className="text-gray-500">
                （対象 {activeTargets.length} 名{inactiveCount > 0 && `・ほか脱退 ${inactiveCount} 名`}）
              </span>
            </span>
          </h2>
          <button
            type="button"
            onClick={() => {
              if (!editTargets) void loadUsers();
              setEditTargets(!editTargets);
            }}
            className="rounded border px-2 py-1 text-xs"
          >
            {editTargets ? '閉じる' : '対象者を編集'}
          </button>
        </div>

        {editTargets ? (
          <div className="flex flex-col gap-2">
            <TargetUserSelector
              users={users}
              selected={targetSel}
              onChange={setTargetSel}
              slotType={slot.slot_type}
            />
            <button
              type="button"
              onClick={saveTargets}
              disabled={busy}
              className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              対象者を保存
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-1">名前</th>
                <th className="py-1">回答</th>
                <th className="py-1">備考</th>
              </tr>
            </thead>
            <tbody>
              {sortedTargets.map((t) => (
                <tr key={t.id} className="border-b last:border-b-0">
                  <td className={`py-1 ${t.is_active ? '' : 'text-gray-500'}`}>
                    {t.name}
                    {!t.is_active && <InactiveBadge />}
                    {absentIds.has(t.id) && <AbsentBadge />}
                  </td>
                  <td className="py-1">
                    {!t.submitted ? (
                      <span className="text-gray-400">未提出</span>
                    ) : t.available ? (
                      <span className="text-green-700">○</span>
                    ) : (
                      <span className="text-red-700">×</span>
                    )}
                  </td>
                  <td className="py-1 text-gray-500">{t.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 割り振り（必要人数と、割り当てた人数の比較つき） */}
      <section className="rounded border bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="font-bold">役割の割り振り</h2>
          {dirty && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
              未保存の変更があります
            </span>
          )}
        </div>

        {/* 役割ごとの 必要人数 / 割り当て */}
        <table className="mb-3 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-1">役割</th>
              <th className="py-1">必要</th>
              {status !== 'open' && <th className="py-1">割り当て</th>}
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => {
              const need = reqs[role] ?? 0;
              const have = assignedCount(role);
              return (
                <tr key={role} className="border-b last:border-b-0">
                  <td className="py-1">{role}</td>
                  <td className="py-1">
                    {reqsEditable ? (
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        aria-label={`${role} の必要人数`}
                        value={need}
                        onChange={(e) =>
                          setReqs({ ...reqs, [role]: Math.max(0, Number(e.target.value) || 0) })
                        }
                        className="w-16 rounded border px-2 py-1"
                      />
                    ) : (
                      need
                    )}
                  </td>
                  {status !== 'open' && (
                    <td className="py-1">
                      <span className={have < need ? 'font-bold text-amber-700' : ''}>
                        {have}
                        {have < need && ` ⚠ あと ${need - have}`}
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {status === 'open' && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={askAssign}
              disabled={busy}
              className="rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              自動割り振りを実行
            </button>
            {reqsDirty && (
              <>
                <button
                  type="button"
                  onClick={() => void saveChanges()}
                  disabled={busy}
                  className="rounded border px-3 py-2 text-sm disabled:opacity-50"
                >
                  必要人数を保存
                </button>
                <button
                  type="button"
                  onClick={cancelEdits}
                  disabled={busy}
                  className="rounded border px-3 py-2 text-sm disabled:opacity-50"
                >
                  変更を取り消す
                </button>
              </>
            )}
          </div>
        )}

        {status !== 'open' && (
          <div className="flex flex-col gap-3">
            {swapping && (
              <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                差し替え中です。外す・追加する・役割を変えるをしてから「差し替えて LINE で知らせる」を押してください。LINE は変更があった人にだけ届きます。
              </p>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-1">名前</th>
                  <th className="py-1">役割</th>
                  {editable && <th className="py-1"></th>}
                </tr>
              </thead>
              <tbody>
                {editAssign.map((a, idx) => (
                  <tr key={a.user_id} className="border-b last:border-b-0">
                    <td className={`py-1 ${a.is_active ? '' : 'text-gray-500'}`}>
                      {a.name}
                      {!a.is_active && <InactiveBadge />}
                      {absentIds.has(a.user_id) && <AbsentBadge />}
                    </td>
                    <td className="py-1">
                      {editable ? (
                        <select
                          value={a.role}
                          aria-label={`${a.name} の役割`}
                          onChange={(e) => {
                            const next = [...editAssign];
                            next[idx] = { ...a, role: e.target.value };
                            setEditAssign(next);
                          }}
                          className="rounded border px-2 py-1"
                        >
                          {/* 今の一覧に無い役割（名前を変える前の「共済」など）は、その人の分だけ選択肢に残す。
                              無いと選択欄が別の役割を表示し、気づかないまま書き換わる */}
                          {[
                            ...roles,
                            NO_ROLE,
                            ...((roles as readonly string[]).includes(a.role) || a.role === NO_ROLE
                              ? []
                              : [a.role]),
                          ].map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        a.role
                      )}
                    </td>
                    {editable && (
                      <td className="py-1 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setEditAssign(editAssign.filter((x) => x.user_id !== a.user_id))
                          }
                          className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700"
                        >
                          外す
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {editable && availableToAdd.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">追加:</span>
                <select
                  value=""
                  onChange={(e) => addMember(e.target.value)}
                  className="rounded border px-2 py-1"
                >
                  <option value="">スタッフを選ぶ</option>
                  {availableToAdd.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.available === true ? '（○）' : t.available === false ? '（×）' : '（未提出）'}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="flex flex-wrap gap-2">
              {status === 'draft' && (
                <>
                  <button
                    type="button"
                    onClick={askPublish}
                    disabled={busy}
                    className="rounded bg-green-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    確定して LINE で知らせる
                  </button>
                  {dirty && (
                    <>
                      <button
                        type="button"
                        onClick={() => void saveChanges()}
                        disabled={busy}
                        className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        確定せずに保存
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdits}
                        disabled={busy}
                        className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                      >
                        変更を取り消す
                      </button>
                    </>
                  )}
                </>
              )}
              {status === 'published' &&
                (swapping ? (
                  <>
                    <button
                      type="button"
                      onClick={askSwap}
                      disabled={busy}
                      className="rounded bg-green-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                    >
                      差し替えて LINE で知らせる
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdits}
                      disabled={busy}
                      className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                      やめる
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setNotice(null);
                      setSwapping(true);
                    }}
                    disabled={busy}
                    className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    割り振りを差し替える
                  </button>
                ))}
              {!swapping && (
                <button
                  type="button"
                  onClick={() => setConfirming({ kind: 'reset' })}
                  disabled={busy}
                  className="ml-auto rounded border border-red-200 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50"
                >
                  割り振りを破棄
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 基本情報の編集（掲示後も変更可）。めったに直さないので下に置く */}
      <section className="rounded border bg-white p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-bold">枠の基本情報</h2>
          <button
            type="button"
            onClick={() => {
              if (!editInfo) {
                setInfoForm({
                  date: slot.date,
                  start_time: slot.start_time.slice(0, 5),
                  end_time: slot.end_time.slice(0, 5),
                  deadline_date: deadlineDate,
                  title: slot.title ?? '',
                  note: slot.note ?? '',
                });
              }
              setEditInfo(!editInfo);
            }}
            className="rounded border px-2 py-1 text-xs"
          >
            {editInfo ? '閉じる' : '編集'}
          </button>
        </div>
        {editInfo ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm">
              日付
              <input
                type="date"
                value={infoForm.date}
                onChange={(e) => {
                  const date = e.target.value;
                  // 日付を動かしたら、提出期限も同じ日数だけ動かす（「何日前」を保つ）
                  const shift =
                    date && infoForm.date && infoForm.deadline_date
                      ? daysBetween(infoForm.date, date)
                      : 0;
                  setInfoForm({
                    ...infoForm,
                    date,
                    deadline_date: shift
                      ? addDays(infoForm.deadline_date, shift)
                      : infoForm.deadline_date,
                  });
                }}
                className="rounded border px-3 py-2"
              />
            </label>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                開始
                <TimeSelect
                  value={infoForm.start_time}
                  onChange={(v) => setInfoForm({ ...infoForm, start_time: v })}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm">
                終了
                <TimeSelect
                  value={infoForm.end_time}
                  onChange={(v) => setInfoForm({ ...infoForm, end_time: v })}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              提出期限（この日の 23:59 まで）
              <input
                type="date"
                value={infoForm.deadline_date}
                max={infoForm.date}
                onChange={(e) => setInfoForm({ ...infoForm, deadline_date: e.target.value })}
                className="rounded border px-3 py-2"
              />
              {infoForm.date && infoForm.deadline_date && (
                <span className="text-xs text-gray-400">
                  {deadlineGapLabel(infoForm.date, infoForm.deadline_date)}
                </span>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              タイトル（任意）
              <input
                type="text"
                value={infoForm.title}
                onChange={(e) => setInfoForm({ ...infoForm, title: e.target.value })}
                maxLength={50}
                placeholder={slot.slot_type === 'training' ? '例: PC研修' : '例: 入学式'}
                className="rounded border px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              備考（任意）
              <input
                type="text"
                value={infoForm.note}
                onChange={(e) => setInfoForm({ ...infoForm, note: e.target.value })}
                className="rounded border px-3 py-2"
              />
            </label>
            <button
              type="button"
              onClick={saveInfo}
              disabled={busy}
              className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              基本情報を保存
            </button>
            <p className="text-xs text-gray-400">
              日付を変えると提出期限も同じ日数だけ一緒に動きます（そのあと期限だけ直せます）。種別の変更はできません。
            </p>
          </div>
        ) : (
          <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
            <dt className="text-gray-500">日付・時間</dt>
            <dd>
              {formatDateJa(slot.date)} {formatTimeRange(slot.start_time, slot.end_time)}
            </dd>
            <dt className="text-gray-500">提出期限</dt>
            <dd>
              {formatDateJa(deadlineDate)} 23:59 まで（{deadlineGapLabel(slot.date, deadlineDate)}）
            </dd>
            <dt className="text-gray-500">タイトル</dt>
            <dd>{slot.title || <span className="text-gray-400">なし</span>}</dd>
            <dt className="text-gray-500">備考</dt>
            <dd>{slot.note || <span className="text-gray-400">なし</span>}</dd>
          </dl>
        )}
      </section>

      {/* 削除 */}
      <div>
        <button
          type="button"
          onClick={() => setConfirming({ kind: 'delete' })}
          disabled={busy}
          className="text-sm text-red-600 underline disabled:opacity-50"
        >
          このシフト枠を削除
        </button>
      </div>

      <ConfirmDialog
        open={!!dialog}
        title={dialog?.title ?? ''}
        confirmLabel={dialog?.confirm ?? ''}
        danger={dialog && 'danger' in dialog ? dialog.danger : false}
        busy={busy}
        onConfirm={() => void dialog?.onConfirm()}
        onCancel={() => setConfirming(null)}
      >
        {dialog?.body}
      </ConfirmDialog>
    </div>
  );
}

// 提出期限がシフトの何日前かの表示
function deadlineGapLabel(date: string, deadlineDate: string): string {
  const gap = daysBetween(deadlineDate, date);
  if (gap === 0) return 'シフト当日';
  return gap > 0 ? `シフトの${gap}日前` : `シフトの${-gap}日後`;
}

// 脱退済みの印（提出状況・割り振りの両方で使う）
function InactiveBadge() {
  return (
    <span className="ml-1 whitespace-nowrap rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-700">
      脱退
    </span>
  );
}

// 欠席連絡を出した人の印（提出状況・割り振りの両方で使う）
function AbsentBadge() {
  return (
    <span className="ml-1 whitespace-nowrap rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">
      欠席連絡あり
    </span>
  );
}

// 欠席連絡を出した人が確定済みの割り振りから外れている（＝対応済み）の印
function ResolvedBadge() {
  return (
    <span className="ml-1 whitespace-nowrap rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800">
      対応済み（割り振りから外れています）
    </span>
  );
}
