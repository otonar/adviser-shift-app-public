'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { SLOT_TYPE_LABEL, type SlotType } from '@/types';
import TargetUserSelector, {
  type SelectableUser,
} from './TargetUserSelector';
import TimeSelect from '../ui/TimeSelect';
import {
  DEFAULT_DEADLINE_DAYS,
  addDays,
  deadlineDateJst,
  formatDateJa,
  formatTimeRange,
  todayJst,
} from '@/lib/datetime';
import StatusBadge from '../ui/StatusBadge';
import { MAX_SESSIONS, sessionNumbers } from '@/lib/session-roles';
import { useFlash, FlashMessage } from '../ui/Flash';

type Slot = {
  id: string;
  slot_type: SlotType;
  date: string;
  start_time: string;
  end_time: string;
  deadline: string;
  expired: boolean;
  assignment_status: 'open' | 'draft' | 'published';
  // title 列を追加する前の DB では返ってこないので省略可にしている
  title?: string | null;
  // 1日の中の回数（migration 013 より前の DB では返らない）
  session_count?: number;
  note: string | null;
  // 提出の進み具合（今日以降の枠だけ API が数える。終わった枠は null）
  progress?: { targets: number; submitted: number; available: number } | null;
};

// 一覧の1行。何の枠か・提出の進み具合・状態がこの行だけで分かるようにする
// （以前は状態バッジだけで、どこから手をつけるか開かないと分からなかった。M2）。
function SlotRow({ slot }: { slot: Slot }) {
  const p = slot.progress;
  const missing = p ? p.targets - p.submitted : 0;
  return (
    <li>
      <Link
        href={`/admin/shifts/${slot.id}`}
        className="press-row flex items-center justify-between gap-2 rounded border bg-white p-3 hover:bg-gray-50"
      >
        <span className="min-w-0">
          <span className="font-bold">{formatDateJa(slot.date)}</span>{' '}
          <span className="text-sm text-gray-600">
            {formatTimeRange(slot.start_time, slot.end_time)}・{SLOT_TYPE_LABEL[slot.slot_type]}
            {(slot.session_count ?? 1) > 1 && `・全${slot.session_count}回`}
          </span>
          {/* 何の枠か見分けるための行。タイトルが無い枠は備考で代用する */}
          {(slot.title || slot.note) && (
            <span className="block truncate text-sm">
              {slot.title && <span className="font-bold">{slot.title}</span>}
              {slot.title && slot.note && ' '}
              {slot.note && <span className="text-gray-500">{slot.note}</span>}
            </span>
          )}
          <span className="block text-xs text-gray-500">
            {p && (
              <>
                提出 {p.submitted}/{p.targets}（○ {p.available}）
                {missing > 0 && slot.assignment_status === 'open' && (
                  <span className="text-amber-700"> 未提出 {missing}</span>
                )}
                {' ・ '}
              </>
            )}
            期限 {formatDateJa(deadlineDateJst(slot.deadline))}
            {slot.expired && '（締切済み）'}
          </span>
        </span>
        <StatusBadge status={slot.assignment_status} expired={slot.expired} />
      </Link>
    </li>
  );
}

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
  const [title, setTitle] = useState('');
  // 1日の中の回数。回ごとに役割を割り振る（1 なら今までどおり1日1役割）
  const [sessionCount, setSessionCount] = useState(1);
  // 提出期限。手で選ぶまでは空（＝送らない）で、サーバが各枠の日付の14日前にする。
  const [deadlineInput, setDeadlineInput] = useState('');
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { message: result, flash } = useFlash(5000);
  // 作成フォームは開いたときだけ出す（スマホで一覧がフォームの下に沈んでいたため）
  const [showForm, setShowForm] = useState(false);

  function addDate() {
    if (!dateInput || dates.includes(dateInput)) return;
    setDates([...dates, dateInput].sort());
    setDateInput('');
  }
  // 選んだまま「追加」を押していない日付も対象に含める（以前は押し忘れると
  // 「日付を1つ以上追加してください」になっていた。M9）。
  // 選んだ瞬間に追加する形は、PC で日付をキーボード入力すると1桁ごとに
  // 変更イベントが出て途中の日付まで入ってしまうので採らなかった。
  const allDates =
    dateInput && !dates.includes(dateInput) ? [...dates, dateInput].sort() : dates;
  function removeDate(d: string) {
    setDates(dates.filter((x) => x !== d));
  }
  // 欄に見せる値。選んでいなくても日付が1つなら既定の日を見せる
  // （複数のときは枠ごとに違う日になるので空のまま）。
  const deadlineShown =
    deadlineInput ||
    (allDates.length === 1 ? addDays(allDates[0], -DEFAULT_DEADLINE_DAYS) : '');

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
    if (allDates.length === 0) {
      setError('日付を選んでください');
      return;
    }
    // dates は昇順なので先頭がいちばん早い日付
    if (deadlineInput && deadlineInput > allDates[0]) {
      setError(`提出期限はいちばん早い日付（${formatDateJa(allDates[0])}）より後にできません`);
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/shifts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_type: slotType,
          dates: allDates,
          start_time: startTime,
          end_time: endTime,
          title: title.trim() || undefined,
          session_count: sessionCount,
          deadline_date: deadlineInput || undefined,
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
      flash(`${data.created}件のシフト枠を掲示しました`);
      setDates([]);
      setDateInput('');
      setStartTime('');
      setEndTime('');
      setTitle('');
      setSessionCount(1);
      setDeadlineInput('');
      setNote('');
      setSelected(new Set());
      await load();
    } finally {
      setCreating(false);
    }
  }

  // API が「今日以降を近い順 → 終わった枠」で返す。終わった枠は新しい順に見せる
  const today = todayJst();
  const upcoming = slots.filter((s) => s.date >= today);
  const past = slots.filter((s) => s.date < today).reverse();

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {/* 掲示した結果はフォームを閉じても見えるよう、フォームの外に出す */}
      <FlashMessage message={result} />
      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="self-start rounded bg-gray-900 px-4 py-2 text-sm text-white"
        >
          ＋ シフト枠を作成
        </button>
      )}
      {/* 作成フォーム */}
      {showForm && (
      <section>
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
                disabled={!dateInput}
                className="rounded border px-3 py-2 text-sm disabled:opacity-50"
              >
                ＋ 別の日も
              </button>
            </div>
            {dates.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {dates.map((d) => (
                  <span
                    key={d}
                    className="flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs"
                  >
                    {formatDateJa(d)}
                    <button
                      type="button"
                      onClick={() => removeDate(d)}
                      className="text-gray-500"
                      aria-label={`${formatDateJa(d)} を外す`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400">
              1日だけならそのまま掲示できます。複数の日に出すときは「＋ 別の日も」で足していくと、同じ時間・対象・提出期限・タイトル・備考でまとめて掲示します。
            </p>
          </div>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              開始
              <TimeSelect value={startTime} onChange={setStartTime} required />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm">
              終了
              <TimeSelect value={endTime} onChange={setEndTime} required />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            回数（1日の中で役割を交代するとき）
            <select
              value={sessionCount}
              onChange={(e) => setSessionCount(Number(e.target.value))}
              className="rounded border px-3 py-2"
            >
              {sessionNumbers(MAX_SESSIONS).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? '1回（交代なし）' : `${n}回`}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-400">
              2回以上にすると、必要人数と役割を「1回目」「2回目」…ごとに決められます。希望（○×）は日単位のままです。
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            提出期限（この日の 23:59 まで）
            <input
              type="date"
              value={deadlineShown}
              max={allDates[0]}
              onChange={(e) => setDeadlineInput(e.target.value)}
              disabled={allDates.length === 0}
              className="rounded border px-3 py-2 disabled:bg-gray-50"
            />
            <span className="text-xs text-gray-400">
              {allDates.length === 0
                ? '先に日付を追加してください。'
                : deadlineInput
                  ? allDates.length > 1
                    ? 'どの枠もこの期限になります。'
                    : ''
                  : `選ばなければ${allDates.length > 1 ? 'それぞれの' : ''}日付の${DEFAULT_DEADLINE_DAYS}日前です。`}
              掲示したあとも、枠を開いて直せます。
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            タイトル（任意）
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={50}
              placeholder={slotType === 'training' ? '例: PC研修' : '例: 入学式'}
              className="rounded border px-3 py-2"
            />
            <span className="text-xs text-gray-400">
              一覧やスタッフの提出画面に出ます。何の枠か分かる短い名前を。
            </span>
          </label>
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
          <button
            type="submit"
            disabled={creating}
            className="rounded bg-gray-900 py-2 text-white disabled:opacity-50"
          >
            {creating
              ? '掲示中…'
              : allDates.length > 1
                ? `${allDates.length}日ぶんを掲示`
                : 'シフト枠を掲示'}
          </button>
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="rounded border py-2 text-sm"
          >
            閉じる
          </button>
        </form>
      </section>
      )}

      {/* 一覧。これからの枠（近い順）を上に、終わった枠は折りたたむ（M1） */}
      <section className="flex flex-col gap-2">
        <h2 className="font-bold">これからの枠</h2>
        {loading && <p className="text-sm text-gray-500">読み込み中…</p>}
        {!loading && upcoming.length === 0 && (
          <p className="text-sm text-gray-500">これからのシフト枠はありません。</p>
        )}
        <ul className="flex flex-col gap-2">
          {upcoming.map((slot) => (
            <SlotRow key={slot.id} slot={slot} />
          ))}
        </ul>
      </section>
      {past.length > 0 && (
        <details>
          <summary className="press-row cursor-pointer rounded border bg-white px-3 py-2 text-sm text-gray-600">
            終わった枠（{past.length}件）
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {past.map((slot) => (
              <SlotRow key={slot.id} slot={slot} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
