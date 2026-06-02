'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { SlotType } from '@/types';
import { rolesForSlotType } from '@/lib/role-assignment';
import TargetUserSelector, {
  type SelectableUser,
} from './TargetUserSelector';

type Slot = {
  id: string;
  slot_type: SlotType;
  date: string;
  start_time: string;
  end_time: string;
  deadline: string;
  assignment_status: 'open' | 'draft' | 'published';
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
};
type RoleReq = { role: string; required_count: number };
type Assignment = { user_id: string; name: string; role: string };
type Detail = {
  slot: Slot;
  targets: Target[];
  role_requirements: RoleReq[];
  assignments: Assignment[];
};

export default function ShiftDetail({ shiftId }: { shiftId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 編集用 state
  const [reqs, setReqs] = useState<Record<string, number>>({});
  const [editAssign, setEditAssign] = useState<Assignment[]>([]);

  // 対象者編集
  const [users, setUsers] = useState<SelectableUser[]>([]);
  const [editTargets, setEditTargets] = useState(false);
  const [targetSel, setTargetSel] = useState<Set<string>>(new Set());

  // 基本情報（日付・時間・備考）の編集
  const [editInfo, setEditInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({
    date: '',
    start_time: '',
    end_time: '',
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
    load();
  }, [load]);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '操作に失敗しました');
        return false;
      }
      return true;
    } catch {
      setError('通信エラーが発生しました');
      return false;
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
    if (!window.confirm('確定してスタッフに公開します。よろしいですか？')) return;
    if (await call(`/api/assignments/${shiftId}/publish`, 'POST')) await load();
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
    if (
      await call(`/api/shifts/${shiftId}`, 'PATCH', {
        date: infoForm.date,
        start_time: infoForm.start_time,
        end_time: infoForm.end_time,
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
  const roles = rolesForSlotType(slot.slot_type);
  const status = slot.assignment_status;
  const assignedIds = new Set(editAssign.map((a) => a.user_id));
  const availableToAdd = targets.filter((t) => !assignedIds.has(t.id));

  return (
    <div className="flex flex-col gap-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {slot.date}（{slot.slot_type === 'day' ? '当日' : '研修'}）
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
                  note: slot.note ?? '',
                });
              }
              setEditInfo(!editInfo);
            }}
            className="rounded border px-2 py-1 text-xs"
          >
            {editInfo ? '閉じる' : '日付・時間・備考を編集'}
          </button>
        </div>
        {editInfo ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm">
              日付
              <input
                type="date"
                value={infoForm.date}
                onChange={(e) => setInfoForm({ ...infoForm, date: e.target.value })}
                className="rounded border px-3 py-2"
              />
            </label>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                開始
                <input
                  type="time"
                  value={infoForm.start_time}
                  onChange={(e) =>
                    setInfoForm({ ...infoForm, start_time: e.target.value })
                  }
                  className="rounded border px-3 py-2"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm">
                終了
                <input
                  type="time"
                  value={infoForm.end_time}
                  onChange={(e) =>
                    setInfoForm({ ...infoForm, end_time: e.target.value })
                  }
                  className="rounded border px-3 py-2"
                />
              </label>
            </div>
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
              日付を変更すると提出期限（日付−14日 23:59 JST）も再計算されます。種別の変更はできません。
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            {slot.start_time.slice(0, 5)}〜{slot.end_time.slice(0, 5)}
            {slot.note ? ` / ${slot.note}` : ''}
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
          <h2 className="font-bold">提出状況（{targets.length} 名）</h2>
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
                  <td className="py-1">{t.name}</td>
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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-1">名前</th>
                  <th className="py-1">役割</th>
                  {status === 'draft' && <th className="py-1"></th>}
                </tr>
              </thead>
              <tbody>
                {editAssign.map((a, idx) => (
                  <tr key={a.user_id} className="border-b last:border-b-0">
                    <td className="py-1">{a.name}</td>
                    <td className="py-1">
                      {status === 'draft' ? (
                        <select
                          value={a.role}
                          onChange={(e) => {
                            const next = [...editAssign];
                            next[idx] = { ...a, role: e.target.value };
                            setEditAssign(next);
                          }}
                          className="rounded border px-2 py-1"
                        >
                          {roles.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        a.role
                      )}
                    </td>
                    {status === 'draft' && (
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

            {status === 'draft' && availableToAdd.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">追加:</span>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const t = targets.find((x) => x.id === e.target.value);
                    if (t) {
                      setEditAssign([
                        ...editAssign,
                        { user_id: t.id, name: t.name, role: roles[0] },
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
              <button
                type="button"
                onClick={reset}
                disabled={busy}
                className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
              >
                やり直し
              </button>
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
