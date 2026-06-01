'use client';

import { useEffect, useState, useCallback } from 'react';

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

function hm(t: string) {
  return t.slice(0, 5);
}

function ShiftCard({ slot, onSaved }: { slot: Slot; onSaved: () => void }) {
  const [note, setNote] = useState(slot.submission?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = slot.submission?.available ?? null;

  async function submit(available: boolean) {
    setSaving(true);
    setError(null);
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
        {current !== null && (
          <span
            className={`rounded px-2 py-1 text-sm ${
              current ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}
          >
            {current ? '○ 提出済み' : '× 提出済み'}
          </span>
        )}
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
                current === true ? 'bg-green-600 text-white' : 'bg-white'
              }`}
            >
              ○ 出られる
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => submit(false)}
              className={`flex-1 rounded border py-2 text-sm disabled:opacity-50 ${
                current === false ? 'bg-red-600 text-white' : 'bg-white'
              }`}
            >
              × 出られない
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

export default function StaffShiftsPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/shifts');
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
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">シフト希望提出</h1>
      {loading && <p className="text-sm text-gray-500">読み込み中…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && slots.length === 0 && (
        <p className="text-sm text-gray-500">対象のシフトはありません。</p>
      )}
      {slots.map((slot) => (
        <ShiftCard key={slot.id} slot={slot} onSaved={load} />
      ))}
    </div>
  );
}
