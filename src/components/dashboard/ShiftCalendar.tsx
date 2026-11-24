'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { NO_ROLE, SLOT_TYPE_LABEL } from '@/types';
import { formatDateJa, formatTimeRange, todayJst } from '@/lib/datetime';
import {
  addMonths,
  monthGrid,
  summarizeByDate,
  type CalendarEntry,
  type DaySummary,
} from '@/lib/calendar';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

// 日付のマスの塗り方（凡例と同じ）
function cellClass(sum: DaySummary | undefined): string {
  if (!sum) return 'text-gray-700';
  switch (sum.status) {
    case 'confirmed':
      return 'bg-accent font-bold text-white';
    case 'available':
      return 'bg-accent/20 font-bold text-accent';
    case 'unanswered':
      return 'font-bold text-accent ring-2 ring-inset ring-accent';
  }
}

function StatusLine({ e }: { e: CalendarEntry }) {
  if (e.status === 'confirmed') {
    return (
      <p className="text-sm">
        {e.role === NO_ROLE ? (
          <>
            <span className="font-bold">出勤</span>
            <span className="text-gray-500">（役割の指定なし）</span>
          </>
        ) : (
          <>
            役割: <span className="font-bold">{e.role}</span>
          </>
        )}
        {e.absence && (
          <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-800">
            欠席連絡済み
          </span>
        )}
      </p>
    );
  }
  if (e.status === 'available') {
    return <p className="text-sm text-gray-600">○ 提出済み（確定待ち）</p>;
  }
  return <p className="text-sm font-bold text-amber-700">未回答</p>;
}

// シフト画面のカレンダー。画面いっぱいに重ねて出す（<dialog> の showModal。背面は押せず、Esc で閉じる）。
// 塗り方: 確定＝濃い／○で提出・未確定＝薄い／期限内の未回答＝枠線（判定は lib/calendar.ts）。
// 日付を押すと下にその日のシフト。未回答の枠は「答える」でカレンダーを閉じてその枠のカードへ。
export default function ShiftCalendar({
  open,
  entries,
  onClose,
  onAnswer,
}: {
  open: boolean;
  entries: CalendarEntry[];
  onClose: () => void;
  onAnswer: (slotId: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [today] = useState(() => todayJst());
  const [ym, setYm] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)),
  }));
  const [selected, setSelected] = useState<string>(today);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // 最初のボタン（‹）に枠が出ないよう、ダイアログ自体にフォーカスを置く
      el.focus();
      // 開いている間は後ろの画面をスクロールさせない（閉じたら元の位置のまま）
      document.documentElement.style.overflow = 'hidden';
    }
    if (!open && el.open) el.close();
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, [open]);

  const byDate = useMemo(() => summarizeByDate(entries), [entries]);
  const cells = monthGrid(ym.year, ym.month);
  const dayEntries = entries.filter((e) => e.date === selected);

  function move(delta: number) {
    setYm((cur) => addMonths(cur.year, cur.month, delta));
  }

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-label="シフトのカレンダー"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // 背景（ダイアログの外側）を押したら閉じる
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 outline-none backdrop:bg-black/40 md:m-auto md:h-auto md:max-h-[90vh] md:max-w-md"
    >
      <div className="flex h-full flex-col overflow-y-auto bg-white pb-[env(safe-area-inset-bottom)] md:rounded-lg">
        {/* 見出し: 月の移動と閉じる */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b-2 border-accent bg-white px-2 py-2">
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="前の月"
            className="rounded-full px-4 py-2 text-lg text-gray-600"
          >
            ‹
          </button>
          <h2 className="font-bold">
            {ym.year}年 {ym.month}月
          </h2>
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => move(1)}
              aria-label="次の月"
              className="rounded-full px-4 py-2 text-lg text-gray-600"
            >
              ›
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="rounded-full px-3 py-2 text-xl text-gray-500"
            >
              ×
            </button>
          </div>
        </div>

        <div className="px-3 pt-3">
          {/* 曜日 */}
          <div className="grid grid-cols-7 text-center text-xs">
            {WEEK.map((w, i) => (
              <div
                key={w}
                className={`py-1 ${i === 0 ? 'text-red-600' : i === 6 ? 'text-blue-600' : 'text-gray-500'}`}
              >
                {w}
              </div>
            ))}
          </div>

          {/* 日付のマス */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((date, i) => {
              if (!date) return <div key={`blank-${i}`} />;
              const sum = byDate.get(date);
              const isToday = date === today;
              const isSelected = date === selected;
              const past = date < today;
              const label = [
                formatDateJa(date),
                sum?.status === 'confirmed' && '確定したシフトあり',
                sum?.status === 'available' && '○ で提出済み',
                sum?.status === 'unanswered' && '未回答の枠あり',
                sum && sum.count > 1 && `${sum.count}件`,
                sum?.absence && '欠席連絡済み',
                isToday && '今日',
              ]
                .filter(Boolean)
                .join('、');
              return (
                <button
                  key={date}
                  type="button"
                  aria-label={label}
                  aria-pressed={isSelected}
                  onClick={() => setSelected(date)}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm ${cellClass(
                    sum
                  )} ${sum && past ? 'opacity-70' : ''} ${
                    isSelected
                      ? 'outline outline-2 outline-offset-2 outline-gray-900'
                      : ''
                  }`}
                >
                  <span
                    className={
                      isToday ? 'underline decoration-2 underline-offset-4' : ''
                    }
                  >
                    {Number(date.slice(8))}
                  </span>
                  {/* 2件以上ある日は件数ぶんの点（3つまで） */}
                  {sum && sum.count > 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-1 flex gap-0.5"
                    >
                      {Array.from(
                        { length: Math.min(sum.count, 3) },
                        (_, k) => (
                          <span
                            key={k}
                            className="h-1 w-1 rounded-full bg-current"
                          />
                        )
                      )}
                    </span>
                  )}
                  {sum?.absence && (
                    <span
                      aria-hidden="true"
                      className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-1 ring-white"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* 凡例 */}
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
            <li className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-accent" /> 確定
            </li>
            <li className="flex items-center gap-1">
              <span className="h-3 w-3 rounded bg-accent/20" /> ○
              で提出（確定待ち）
            </li>
            <li className="flex items-center gap-1">
              <span className="h-3 w-3 rounded ring-2 ring-inset ring-accent" />{' '}
              未回答
            </li>
            <li className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-500" /> 欠席連絡済み
            </li>
          </ul>
        </div>

        {/* 選んだ日のシフト */}
        <section className="mt-3 flex-1 border-t px-3 py-3">
          <h3 className="font-bold">{formatDateJa(selected)}</h3>
          {dayEntries.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">
              この日のシフトはありません。
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {dayEntries.map((e) => (
                <li key={e.slotId} className="rounded border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-600">
                        {formatTimeRange(e.start_time, e.end_time)}・
                        {SLOT_TYPE_LABEL[e.slot_type]}
                      </p>
                      {e.title && <p className="font-bold">{e.title}</p>}
                      <StatusLine e={e} />
                    </div>
                    {e.status === 'unanswered' && (
                      <button
                        type="button"
                        onClick={() => onAnswer(e.slotId)}
                        className="shrink-0 rounded bg-accent px-3 py-2 text-sm text-white"
                      >
                        答える
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </dialog>
  );
}
