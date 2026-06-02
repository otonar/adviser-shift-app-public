'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';

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

  const [choices, setChoices] = useState<Record<string, boolean | null>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 読み込み（onSaved 後の再取得含む）のたびに現在の提出状況で初期化
  useEffect(() => {
    setChoices(
      Object.fromEntries(openSlots.map((s) => [s.id, s.submission?.available ?? null]))
    );
  }, [openSlots]);

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
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setChoices((c) => ({ ...c, [slot.id]: true }))
                  }
                  className={`rounded border px-3 py-1 text-sm ${
                    choice === true ? 'bg-green-600 text-white' : 'bg-white'
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
                    choice === false ? 'bg-red-600 text-white' : 'bg-white'
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

export default function StaffShiftsPage() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'single' | 'bulk'>('single');

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
    </div>
  );
}
