'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import type { SlotType } from '@/types';
import TargetUserSelector, {
  type SelectableUser,
} from './TargetUserSelector';

type Slot = {
  id: string;
  slot_type: SlotType;
  date: string;
  start_time: string;
  end_time: string;
  assignment_status: 'open' | 'draft' | 'published';
  note: string | null;
};

const statusBadge: Record<Slot['assignment_status'], { label: string; cls: string }> = {
  open: { label: '受付中', cls: 'bg-blue-100 text-blue-800' },
  draft: { label: '調整中', cls: 'bg-yellow-100 text-yellow-800' },
  published: { label: '確定', cls: 'bg-green-100 text-green-800' },
};

export default function AdminShifts() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [users, setUsers] = useState<SelectableUser[]>([]);
  const [loading, setLoading] = useState(true);

  // 作成フォーム state
  const [slotType, setSlotType] = useState<SlotType>('day');
  const [dates, setDates] = useState<string[]>([]);
  const [dateInput, setDateInput] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function addDate() {
    if (!dateInput || dates.includes(dateInput)) return;
    setDates([...dates, dateInput].sort());
    setDateInput('');
  }
  function removeDate(d: string) {
    setDates(dates.filter((x) => x !== d));
  }

  const load = useCallback(async () => {
    const [sRes, uRes] = await Promise.all([
      fetch('/api/shifts'),
      fetch('/api/users'),
    ]);
    if (sRes.ok) setSlots((await sRes.json()).slots ?? []);
    if (uRes.ok) setUsers((await uRes.json()).users ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function createSlot(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (dates.length === 0) {
      setError('日付を1つ以上追加してください');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/shifts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_type: slotType,
          dates,
          start_time: startTime,
          end_time: endTime,
          note: note || undefined,
          target_user_ids: Array.from(selected),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '作成に失敗しました');
        return;
      }
      const data = await res.json();
      setResult(`${data.created}件のシフト枠を掲示しました ✓`);
      setDates([]);
      setDateInput('');
      setStartTime('');
      setEndTime('');
      setNote('');
      setSelected(new Set());
      await load();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      {/* 作成フォーム */}
      <section className="md:w-96">
        <h2 className="mb-2 font-bold">シフト枠を作成</h2>
        <form onSubmit={createSlot} className="flex flex-col gap-3 rounded border bg-white p-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setSlotType('day');
                setSelected(new Set());
              }}
              className={`flex-1 rounded border py-1.5 text-sm ${
                slotType === 'day' ? 'bg-gray-900 text-white' : 'bg-white'
              }`}
            >
              当日
            </button>
            <button
              type="button"
              onClick={() => {
                setSlotType('training');
                setSelected(new Set());
              }}
              className={`flex-1 rounded border py-1.5 text-sm ${
                slotType === 'training' ? 'bg-gray-900 text-white' : 'bg-white'
              }`}
            >
              研修
            </button>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            日付（複数選択可）
            <div className="flex gap-2">
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="flex-1 rounded border px-3 py-2"
              />
              <button
                type="button"
                onClick={addDate}
                className="rounded border px-3 py-2 text-sm"
              >
                追加
              </button>
            </div>
            {dates.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {dates.map((d) => (
                  <span
                    key={d}
                    className="flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs"
                  >
                    {d}
                    <button
                      type="button"
                      onClick={() => removeDate(d)}
                      className="text-gray-500"
                      aria-label={`${d} を削除`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400">
              日付を選んで「追加」。複数追加すると同じ時間・対象・備考でまとめて掲示します。
            </p>
          </div>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              開始
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="rounded border px-3 py-2"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              終了
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="rounded border px-3 py-2"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            備考（任意）
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="rounded border px-3 py-2"
            />
          </label>
          <div>
            <p className="mb-1 text-sm">対象スタッフ</p>
            <TargetUserSelector
              users={users}
              selected={selected}
              onChange={setSelected}
              slotType={slotType}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {result && <p className="text-sm font-bold text-green-600">{result}</p>}
          <button
            type="submit"
            disabled={creating}
            className="rounded bg-gray-900 py-2 text-white disabled:opacity-50"
          >
            {creating
              ? '掲示中…'
              : dates.length > 1
                ? `${dates.length}日ぶんを掲示`
                : 'シフト枠を掲示'}
          </button>
        </form>
      </section>

      {/* 一覧 */}
      <section className="flex-1">
        <h2 className="mb-2 font-bold">シフト枠一覧</h2>
        {loading && <p className="text-sm text-gray-500">読み込み中…</p>}
        {!loading && slots.length === 0 && (
          <p className="text-sm text-gray-500">まだシフト枠がありません。</p>
        )}
        <ul className="flex flex-col gap-2">
          {slots.map((slot) => {
            const badge = statusBadge[slot.assignment_status];
            return (
              <li key={slot.id}>
                <Link
                  href={`/admin/shifts/${slot.id}`}
                  className="flex items-center justify-between rounded border bg-white p-3 hover:bg-gray-50"
                >
                  <span>
                    <span className="font-bold">{slot.date}</span>{' '}
                    <span className="text-sm text-gray-600">
                      {slot.start_time.slice(0, 5)}〜{slot.end_time.slice(0, 5)}（
                      {slot.slot_type === 'day' ? '当日' : '研修'}）
                    </span>
                  </span>
                  <span className={`rounded px-2 py-0.5 text-xs ${badge.cls}`}>
                    {badge.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
