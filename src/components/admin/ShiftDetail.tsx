'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { SlotType } from '@/types';
import { NO_ROLE } from '@/types';
import { rolesForSlotType } from '@/lib/role-assignment';
import { addDays, daysBetween, deadlineDateJst } from '@/lib/datetime';
import TargetUserSelector, {
  type SelectableUser,
} from './TargetUserSelector';
import TimeSelect from '../ui/TimeSelect';

type Slot = {
  id: string;
  slot_type: SlotType;
  date: string;
  start_time: string;
  end_time: string;
  deadline: string;
  assignment_status: 'open' | 'draft' | 'published';
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
  // 欠席連絡（提出期限後）。古い API では返ってこないので省略可
  absences?: Absence[];
};

export default function ShiftDetail({ shiftId }: { shiftId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 失敗ではないが伝えたいこと（脱退者が割り振りに残っていた、など）
  const [notice, setNotice] = useState<string | null>(null);

  // 編集用 state
  const [reqs, setReqs] = useState<Record<string, number>>({});
  const [editAssign, setEditAssign] = useState<Assignment[]>([]);
  // 確定（公開）後の差し替えモード。オンの間だけ公開済みの割り振りを編集できる
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
      Object.fromEntries(
        data.role_requirements.map((r) => [r.role, r.required_count])
      )
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

  // 成功でレスポンス本文、失敗で null を返す（`if (await call(...))` はそのまま使える）。
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

  async function saveReqs() {
    const role_requirements = Object.entries(reqs).map(([role, required_count]) => ({
      role,
      required_count,
    }));
    if (await call(`/api/shifts/${shiftId}`, 'PATCH', { role_requirements }))
      await load();
  }

  async function runAssign() {
    if (await call('/api/assignments', 'POST', { shift_slot_id: shiftId }))
      await load();
  }

  async function saveAssign() {
    const assignments = editAssign.map((a) => ({
      userId: a.user_id,
      role: a.role,
    }));
    if (await call(`/api/assignments/${shiftId}`, 'PATCH', { assignments }))
      await load();
  }

  async function publish() {
    setNotice(null);
    // 脱退した人が割り振りに残ったまま確定すると、名簿に名前が残るのに本人はログイン
    // できず通知も届かない。確定する前に気づけるよう、ここで名前を出して確認する。
    const leaving = editAssign.filter((a) => !a.is_active).map((a) => a.name);
    const warn =
      leaving.length > 0
        ? `⚠ 脱退した人が割り振りに残っています: ${leaving.join('・')}\n` +
          'このまま確定すると名簿に名前が残りますが、本人には通知されません。\n' +
          '外す場合は「キャンセル」を押し、一覧の「削除」で外してから確定してください。\n\n'
        : '';
    if (!window.confirm(`${warn}確定してスタッフに公開します。よろしいですか？`)) return;
    // 画面上で変更した役割を先に保存してから公開する（未保存の編集が破棄されるのを防ぐ）
    const assignments = editAssign.map((a) => ({
      userId: a.user_id,
      role: a.role,
    }));
    if (!(await call(`/api/assignments/${shiftId}`, 'PATCH', { assignments })))
      return;
    const result = await call(`/api/assignments/${shiftId}/publish`, 'POST');
    if (!result) return;
    const inactive = Array.isArray(result.inactive)
      ? (result.inactive as string[])
      : [];
    if (inactive.length > 0) {
      setNotice(
        `脱退した人が割り振りに含まれていたため、その人には通知していません: ${inactive.join('・')}`
      );
    }
    await load();
  }

  // 公開後の差し替え。変更があった人にだけ LINE が届く（追加・外れた・役割変更）
  async function saveSwap() {
    if (!detail) return;
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
    if (lines.length === 0) {
      setNotice('変更はありません');
      setSwapping(false);
      return;
    }
    if (
      !window.confirm(
        `${lines.join('\n')}\n\nこの内容で差し替えます。変更があった人にだけ LINE で知らせます。よろしいですか？`
      )
    )
      return;
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

  function cancelSwap() {
    if (detail) setEditAssign(detail.assignments);
    setSwapping(false);
  }

  async function reset() {
    if (!window.confirm('割り振りを破棄して受付中に戻します。よろしいですか？')) return;
    if (await call(`/api/assignments/${shiftId}/reset`, 'POST')) await load();
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
        // 変えたときだけ送る（title 列を追加する前の DB でも他の項目は保存できるように）
        ...(title !== (detail?.slot.title ?? '') ? { title: title || null } : {}),
        note: infoForm.note || null,
      })
    ) {
      setEditInfo(false);
      await load();
    }
  }

  async function deleteSlot() {
    if (!window.confirm('このシフト枠を削除します。元に戻せません。')) return;
    if (await call(`/api/shifts/${shiftId}`, 'DELETE')) router.push('/admin/shifts');
  }

  if (loading) return <p className="text-sm text-gray-500">読み込み中…</p>;
  if (!detail) return <p className="text-sm text-red-600">{error ?? 'エラー'}</p>;

  const { slot, targets } = detail;
  const absences = detail.absences ?? [];
  const absentIds = new Set(absences.map((a) => a.user_id));
  // 確定済みの枠で割り振りに入っていなければ「対応済み」（保存済みの割り振りで判定する）
  const savedAssignedIds = new Set(detail.assignments.map((a) => a.user_id));
  const isResolved = (userId: string) =>
    detail.slot.assignment_status === 'published' && !savedAssignedIds.has(userId);
  const roles = rolesForSlotType(slot.slot_type);
  const status = slot.assignment_status;
  const assignedIds = new Set(editAssign.map((a) => a.user_id));
  // 脱退した人は手動追加の候補にも出さない（自動割り振りが外すのと揃える）
  // 追加の候補はこの枠の対象者（在籍中）全員。○ の人を上に、×・未提出は後ろに並べて印を付ける
  // （急な代役は「× だったけど行ける」人のこともあるので候補から外さない）
  const availabilityOrder = (t: Target) => (t.available === true ? 0 : t.available === null ? 1 : 2);
  const availableToAdd = targets
    .filter((t) => !assignedIds.has(t.id) && t.is_active)
    .sort((a, b) => availabilityOrder(a) - availabilityOrder(b));
  // 割り振りの表を編集できるか（調整中、または確定後の差し替えモード）
  const editable = status === 'draft' || (status === 'published' && swapping);
  const inactiveTargets = targets.filter((t) => !t.is_active);
  const deadlineDate = deadlineDateJst(slot.deadline);

  return (
    <div className="flex flex-col gap-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {slot.date}（{slot.slot_type === 'day' ? '当日' : '研修'}）
            {slot.title ? ` ${slot.title}` : ''}
          </h1>
          <p className="text-sm text-gray-600">
            {slot.start_time.slice(0, 5)}〜{slot.end_time.slice(0, 5)}
            {slot.note ? ` / ${slot.note}` : ''}
          </p>
        </div>
        <span className="rounded bg-gray-100 px-2 py-1 text-sm">
          {status === 'open' ? '受付中' : status === 'draft' ? '調整中' : '確定'}
        </span>
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
            提出期限のあとに届いた連絡です。割り振りからは自動で外れていないので、必要なら調整してください。
          </p>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {absences.map((a) => (
              <li key={a.user_id} className="rounded bg-white p-2">
                <span className="font-bold">{a.name}</span>
                {isResolved(a.user_id) && <ResolvedBadge />}
                <span className="ml-2 text-xs text-gray-500">
                  {new Intl.DateTimeFormat('ja-JP', {
                    timeZone: 'Asia/Tokyo',
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(a.created_at))}
                </span>
                <p className="whitespace-pre-wrap text-gray-700">理由: {a.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 基本情報の編集（掲示後も変更可） */}
      <section className="rounded border bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
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
            {editInfo ? '閉じる' : '日付・時間・提出期限・タイトル・備考を編集'}
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
                  // 日付を動かしたら、期限も同じ日数だけ動かす（「何日前」を保つ）
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
                onChange={(e) =>
                  setInfoForm({ ...infoForm, deadline_date: e.target.value })
                }
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
                placeholder={slot.slot_type === 'training' ? '例: 共済研修' : '例: 入学式'}
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
          <p className="text-sm text-gray-600">
            {slot.title ? `${slot.title} / ` : ''}
            {slot.start_time.slice(0, 5)}〜{slot.end_time.slice(0, 5)}
            {slot.note ? ` / ${slot.note}` : ''}
            <span className="block">
              提出期限: {deadlineDate} 23:59 まで（
              {deadlineGapLabel(slot.date, deadlineDate)}）
            </span>
          </p>
        )}
      </section>

      {/* 役割別必要人数 */}
      <section className="rounded border bg-white p-4">
        <h2 className="mb-2 font-bold">役割別 必要人数</h2>
        <div className="flex flex-wrap gap-3">
          {roles.map((role) => (
            <label key={role} className="flex items-center gap-1 text-sm">
              {role}
              <input
                type="number"
                min={0}
                value={reqs[role] ?? 0}
                onChange={(e) =>
                  setReqs({ ...reqs, [role]: Number(e.target.value) })
                }
                className="w-16 rounded border px-2 py-1"
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={saveReqs}
          disabled={busy}
          className="mt-3 rounded border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          必要人数を保存
        </button>
      </section>

      {/* 提出状況 */}
      <section className="rounded border bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">
            提出状況（{targets.length} 名
            {inactiveTargets.length > 0 && (
              <span className="font-normal text-gray-500">
                {' '}
                / うち脱退 {inactiveTargets.length} 名
              </span>
            )}
            ）
          </h2>
          <button
            type="button"
            onClick={() => {
              if (!editTargets) loadUsers();
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
              {targets.map((t) => (
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

      {/* 割り振り */}
      <section className="rounded border bg-white p-4">
        <h2 className="mb-2 font-bold">役割割り振り</h2>

        {status === 'open' && (
          <button
            type="button"
            onClick={runAssign}
            disabled={busy}
            className="rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            自動割り振りを実行
          </button>
        )}

        {status !== 'open' && (
          <div className="flex flex-col gap-3">
            {swapping && (
              <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                差し替え中です。外す・追加する・役割を変えるをしてから「差し替えを保存して通知」を押してください。LINE は変更があった人にだけ届きます。
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
                          onChange={(e) => {
                            const next = [...editAssign];
                            next[idx] = { ...a, role: e.target.value };
                            setEditAssign(next);
                          }}
                          className="rounded border px-2 py-1"
                        >
                          {[...roles, NO_ROLE].map((r) => (
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
                            setEditAssign(
                              editAssign.filter((x) => x.user_id !== a.user_id)
                            )
                          }
                          className="text-xs text-red-600"
                        >
                          削除
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {editable && availableToAdd.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">追加:</span>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const t = targets.find((x) => x.id === e.target.value);
                    if (t) {
                      setEditAssign([
                        ...editAssign,
                        {
                          user_id: t.id,
                          name: t.name,
                          role: roles[0],
                          // 候補に出るのは在籍者だけ（availableToAdd で絞っている）
                          is_active: true,
                        },
                      ]);
                    }
                    e.target.value = '';
                  }}
                  className="rounded border px-2 py-1"
                >
                  <option value="">スタッフを選択</option>
                  {availableToAdd.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.available === true ? '（○）' : t.available === false ? '（×）' : '（未提出）'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {status === 'draft' && (
                <>
                  <button
                    type="button"
                    onClick={saveAssign}
                    disabled={busy}
                    className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    手動調整を保存
                  </button>
                  <button
                    type="button"
                    onClick={publish}
                    disabled={busy}
                    className="rounded bg-green-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    確定して共有
                  </button>
                </>
              )}
              {status === 'published' &&
                (swapping ? (
                  <>
                    <button
                      type="button"
                      onClick={saveSwap}
                      disabled={busy}
                      className="rounded bg-green-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                    >
                      差し替えを保存して通知
                    </button>
                    <button
                      type="button"
                      onClick={cancelSwap}
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
                  onClick={reset}
                  disabled={busy}
                  className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  やり直し
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 削除 */}
      <div>
        <button
          type="button"
          onClick={deleteSlot}
          disabled={busy}
          className="text-sm text-red-600 disabled:opacity-50"
        >
          このシフト枠を削除
        </button>
      </div>
    </div>
  );
}

// 期限が枠の日付の何日前かを言葉にする。
function deadlineGapLabel(date: string, deadlineDate: string): string {
  const gap = daysBetween(deadlineDate, date);
  if (gap === 0) return 'シフト当日';
  return gap > 0 ? `シフトの${gap}日前` : `シフトの${-gap}日後`;
}

// 脱退した人が対象者や割り振りに残っていることがある（脱退しても行は消えない）。
// 名前だけでは在籍者と区別が付かないので、一覧では必ずこれを添える。
function InactiveBadge() {
  return (
    <span className="ml-1 whitespace-nowrap rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-700">
      脱退
    </span>
  );
}

// 提出期限のあとに本人から欠席連絡が来ている印。
function AbsentBadge() {
  return (
    <span className="ml-1 whitespace-nowrap rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">
      欠席連絡あり
    </span>
  );
}

// 欠席連絡を出した人が確定済みの割り振りから外れている（対応済み）印。
function ResolvedBadge() {
  return (
    <span className="ml-1 whitespace-nowrap rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800">
      対応済み（割り振りから外れています）
    </span>
  );
}
