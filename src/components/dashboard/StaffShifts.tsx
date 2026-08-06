'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { NO_ROLE } from '@/types';

type Slot = {
  id: string;
  slot_type: 'day' | 'training';
  date: string;
  start_time: string;
  end_time: string;
  deadline: string;
  note: string | null;
  expired: boolean;
  submission: { available: boolean; note: string | null } | null;
};

// 確定した役割（published のみ・サーバー側で取得して渡される）
export type MyRole = {
  role: string;
  date: string;
  start_time: string;
  end_time: string;
  slot_type: 'day' | 'training';
};

function hm(t: string) {
  return t.slice(0, 5);
}

function ShiftCard({ slot, onSaved }: { slot: Slot; onSaved: () => void }) {
  const [note, setNote] = useState(slot.submission?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = slot.submission?.available ?? null;

  async function submit(available: boolean) {
    setSaving(true);
    setError(null);
    setJustSaved(false);
    try {
      const res = await fetch(`/api/shifts/${slot.id}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available, note: note || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '保存に失敗しました');
        return;
      }
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
      onSaved();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`rounded border bg-white p-4 ${slot.expired ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold">
            {slot.date}（{slot.slot_type === 'day' ? '当日' : '研修'}）
          </p>
          <p className="text-sm text-gray-600">
            {hm(slot.start_time)}〜{hm(slot.end_time)}
          </p>
        </div>
        <span
          className={`rounded px-2 py-1 text-sm font-bold ${
            current === null
              ? 'bg-gray-100 text-gray-500'
              : current
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
          }`}
        >
          {current === null ? '未回答' : current ? '○ 出られる' : '× 出られない'}
        </span>
      </div>
      {slot.note && <p className="mt-1 text-sm text-gray-500">{slot.note}</p>}

      {slot.expired ? (
        <p className="mt-3 text-sm text-gray-500">提出期限が過ぎています</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="備考（任意）"
            className="rounded border px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => submit(true)}
              className={`flex-1 rounded border py-2 text-sm disabled:opacity-50 ${
                current === true
                  ? 'border-green-700 bg-green-600 font-bold text-white'
                  : 'bg-white text-gray-500'
              }`}
            >
              ○ 出られる
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => submit(false)}
              className={`flex-1 rounded border py-2 text-sm disabled:opacity-50 ${
                current === false
                  ? 'border-red-700 bg-red-600 font-bold text-white'
                  : 'bg-white text-gray-500'
              }`}
            >
              × 出られない
            </button>
          </div>
          {saving && <p className="text-sm text-gray-500">保存中…</p>}
          {justSaved && !saving && (
            <p className="text-sm font-bold text-green-600">保存しました ✓</p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

function hmRange(slot: Slot) {
  return `${hm(slot.start_time)}〜${hm(slot.end_time)}`;
}

// まとめて提出モード: 期限内の枠を一覧し、各行で ○/× を選んで1回で保存する。
function BulkSubmit({ slots, onSaved }: { slots: Slot[]; onSaved: () => void }) {
  // 期限内の枠だけ対象（期限切れは編集不可）
  const openSlots = useMemo(() => slots.filter((s) => !s.expired), [slots]);

  const [choices, setChoices] = useState<Record<string, boolean | null>>(() =>
    Object.fromEntries(openSlots.map((s) => [s.id, s.submission?.available ?? null]))
  );
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // openSlots が変わったら（再読込・onSaved 後）現在の提出状況で choices を作り直す。
  // 派生 state の更新は effect ではなくレンダー中に行う（React 推奨パターン）。
  const [prevOpenSlots, setPrevOpenSlots] = useState(openSlots);
  if (openSlots !== prevOpenSlots) {
    setPrevOpenSlots(openSlots);
    setChoices(
      Object.fromEntries(openSlots.map((s) => [s.id, s.submission?.available ?? null]))
    );
  }

  function setAll(value: boolean) {
    setChoices(Object.fromEntries(openSlots.map((s) => [s.id, value])));
  }

  async function save() {
    const items = openSlots
      .filter((s) => choices[s.id] !== null && choices[s.id] !== undefined)
      .map((s) => ({ shift_slot_id: s.id, available: choices[s.id] as boolean }));
    if (items.length === 0) {
      setError('○か×を選んでください');
      return;
    }
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/shifts/submissions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '保存に失敗しました');
        return;
      }
      const data = await res.json();
      setResult(
        `${data.saved}件 保存しました ✓${data.skipped ? `（${data.skipped}件はスキップ）` : ''}`
      );
      onSaved();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSaving(false);
    }
  }

  if (openSlots.length === 0) {
    return <p className="text-sm text-gray-500">提出できる（期限内の）シフトはありません。</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">一括設定:</span>
        <button
          type="button"
          onClick={() => setAll(true)}
          className="rounded border px-3 py-1 text-sm"
        >
          全部○
        </button>
        <button
          type="button"
          onClick={() => setAll(false)}
          className="rounded border px-3 py-1 text-sm"
        >
          全部×
        </button>
      </div>

      <div className="divide-y rounded border bg-white">
        {openSlots.map((slot) => {
          const choice = choices[slot.id] ?? null;
          return (
            <div
              key={slot.id}
              className="flex items-center justify-between gap-2 px-3 py-2"
            >
              <div className="text-sm">
                <span className="font-bold">{slot.date}</span>（
                {slot.slot_type === 'day' ? '当日' : '研修'}）{' '}
                <span className="text-gray-600">{hmRange(slot)}</span>
                {choice === null && (
                  <span className="ml-1 text-xs text-gray-400">（未回答）</span>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setChoices((c) => ({ ...c, [slot.id]: true }))
                  }
                  className={`rounded border px-3 py-1 text-sm ${
                    choice === true
                      ? 'border-green-700 bg-green-600 font-bold text-white'
                      : 'bg-white text-gray-500'
                  }`}
                >
                  ○
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setChoices((c) => ({ ...c, [slot.id]: false }))
                  }
                  className={`rounded border px-3 py-1 text-sm ${
                    choice === false
                      ? 'border-red-700 bg-red-600 font-bold text-white'
                      : 'bg-white text-gray-500'
                  }`}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="rounded bg-gray-900 py-2 text-sm text-white disabled:opacity-50"
      >
        {saving ? '保存中…' : 'まとめて保存'}
      </button>
      {result && <p className="text-sm font-bold text-green-600">{result}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// 確定した役割の一覧（旧 /dashboard/my-roles）。データはサーバー側で取得済み。
function MyRoles({ roles }: { roles: MyRole[] }) {
  if (roles.length === 0) {
    return (
      <p className="text-sm text-gray-500">公開済みの割り当てはまだありません。</p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {roles.map((r, i) => (
        <li key={i} className="rounded border bg-white p-4">
          <p className="font-bold">
            {r.date}（{r.slot_type === 'day' ? '当日' : '研修'}）
          </p>
          <p className="text-sm text-gray-600">
            {hm(r.start_time)}〜{hm(r.end_time)}
          </p>
          {r.role === NO_ROLE ? (
            <p className="mt-1">
              <span className="font-bold">出勤</span>
              <span className="text-sm text-gray-500">（役割の指定なし）</span>
            </p>
          ) : (
            <p className="mt-1">
              役割: <span className="font-bold">{r.role}</span>
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

// シフト画面。「希望を出す」と「確定した役割」を1画面の切り替えにまとめている
// （下部ナビのタブ数を減らして1つ1つを大きくするため）。
export default function StaffShifts({
  myRoles,
  initialView = 'submit',
}: {
  myRoles: MyRole[];
  initialView?: 'submit' | 'roles';
}) {
  const [view, setView] = useState<'submit' | 'roles'>(initialView);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'single' | 'bulk'>('single');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/shifts?scope=mine');
      if (!res.ok) {
        setError('読み込みに失敗しました');
        return;
      }
      const data = await res.json();
      setSlots(data.slots ?? []);
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const unanswered = slots.filter((s) => !s.expired && !s.submission).length;

  return (
    <div className="flex flex-col gap-4">
      {/* 画面の切り替え */}
      <div className="flex gap-1 rounded border bg-white p-1">
        <button
          type="button"
          onClick={() => setView('submit')}
          className={`flex-1 rounded px-3 py-2 text-sm ${
            view === 'submit' ? 'bg-gray-900 font-bold text-white' : 'text-gray-600'
          }`}
        >
          希望を出す
          {unanswered > 0 && (
            <span
              className={`ml-1 rounded-full px-1.5 text-xs ${
                view === 'submit' ? 'bg-white text-gray-900' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {unanswered}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setView('roles')}
          className={`flex-1 rounded px-3 py-2 text-sm ${
            view === 'roles' ? 'bg-gray-900 font-bold text-white' : 'text-gray-600'
          }`}
        >
          確定した役割
        </button>
      </div>

      {view === 'roles' ? (
        <>
          <h1 className="text-xl font-bold">確定した役割</h1>
          <MyRoles roles={myRoles} />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">シフト希望提出</h1>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setMode('single')}
                className={`rounded border px-3 py-1 text-sm ${
                  mode === 'single' ? 'bg-gray-900 text-white' : 'bg-white'
                }`}
              >
                1件ずつ
              </button>
              <button
                type="button"
                onClick={() => setMode('bulk')}
                className={`rounded border px-3 py-1 text-sm ${
                  mode === 'bulk' ? 'bg-gray-900 text-white' : 'bg-white'
                }`}
              >
                まとめて
              </button>
            </div>
          </div>

          {loading && <p className="text-sm text-gray-500">読み込み中…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && slots.length === 0 && (
            <p className="text-sm text-gray-500">対象のシフトはありません。</p>
          )}

          {!loading &&
            slots.length > 0 &&
            (mode === 'single' ? (
              slots.map((slot) => (
                <ShiftCard key={slot.id} slot={slot} onSaved={load} />
              ))
            ) : (
              <BulkSubmit slots={slots} onSaved={load} />
            ))}
        </>
      )}
    </div>
  );
}
