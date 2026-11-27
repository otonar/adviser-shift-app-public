'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { SLOT_TYPE_LABEL } from '@/types';
import RoleText from '@/components/ui/RoleText';
import {
  formatDeadlineJst,
  formatDateJa,
  formatTimeRange,
  todayJst,
} from '@/lib/datetime';
import { ABSENCE_REASON_MAX } from '@/lib/absence';
import { useFlash, FlashMessage } from '@/components/ui/Flash';
import CardSkeleton from '@/components/ui/CardSkeleton';
import { CalendarIcon } from '@/components/ui/NavIcons';
import { buildCalendarEntries } from '@/lib/calendar';
import ShiftCalendar from './ShiftCalendar';

type Slot = {
  id: string;
  slot_type: 'day' | 'training';
  date: string;
  start_time: string;
  end_time: string;
  deadline: string;
  // title 列を追加する前の DB では返ってこないので省略可にしている
  title?: string | null;
  note: string | null;
  expired: boolean;
  submission: { available: boolean; note: string | null } | null;
  // 欠席連絡（提出期限後）。010 を適用する前の API では返ってこないので省略可
  absence?: { reason: string; created_at: string } | null;
  can_report_absence?: boolean;
  can_cancel_absence?: boolean;
};

// 確定した役割（published のみ・サーバー側で取得して渡される）
export type MyRole = {
  slot_id: string;
  roles: string[]; // 回の順
  date: string;
  start_time: string;
  end_time: string;
  slot_type: 'day' | 'training';
  title: string | null;
};

type View = 'submit' | 'roles';

// 枠の見出し（日付・種別・タイトル・時間）。提出・期限切れ・確定した役割で同じ書き方にする。
function SlotHeading({
  slot,
}: {
  slot: Pick<Slot, 'date' | 'slot_type' | 'start_time' | 'end_time'> & {
    title?: string | null;
  };
}) {
  return (
    <div className="min-w-0">
      <p className="font-bold">
        {formatDateJa(slot.date)}
        <span className="ml-1 text-sm font-normal text-gray-600">
          {formatTimeRange(slot.start_time, slot.end_time)}・
          {SLOT_TYPE_LABEL[slot.slot_type]}
        </span>
      </p>
      {slot.title && <p className="font-bold">{slot.title}</p>}
    </div>
  );
}

// ○ / × の2択ボタン。押した瞬間に保存する（「1件ずつ」と「まとめて」で保存の仕方が
// 違っていたのをやめ、どこで押しても即保存に揃えた。2026-11-24）。
function AnswerButtons({
  current,
  onChoose,
}: {
  current: boolean | null;
  onChoose: (available: boolean) => void;
}) {
  return (
    <div className="flex gap-2">
      {([true, false] as const).map((value) => {
        const selected = current === value;
        const on = value
          ? 'border-green-700 bg-green-600 font-bold text-white'
          : 'border-red-700 bg-red-600 font-bold text-white';
        return (
          <button
            key={String(value)}
            type="button"
            aria-pressed={selected}
            onClick={() => onChoose(value)}
            className={`flex-1 rounded border py-2.5 text-sm ${
              selected ? on : 'bg-white text-gray-600'
            }`}
          >
            {value ? '○ 出られる' : '× 出られない'}
          </button>
        );
      })}
    </div>
  );
}

// 期限内の枠のカード。○×も備考も、それだけで保存できる。
// 以前は備考を後から書いたとき、○×をもう一度押さないと保存されなかった（本人指摘 2026-11-24）。
// 今は、回答済みなら備考は「入力欄から離れたとき」か「備考を保存」で保存される。
// 未回答なら ○× を押したときに備考も一緒に送る。
function ShiftCard({
  slot,
  highlight,
  focused = false,
  onSaved,
}: {
  slot: Slot;
  highlight: boolean;
  // カレンダーの「答える」から来たとき、どのカードか分かるよう一時的に枠を付ける
  focused?: boolean;
  onSaved: () => void;
}) {
  const savedNote = slot.submission?.note ?? '';
  const [note, setNote] = useState(savedNote);
  // 押した直後から選択状態を見せる（サーバーの応答を待たない）。失敗したら戻す。
  const [current, setCurrent] = useState<boolean | null>(
    slot.submission?.available ?? null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { message, flash } = useFlash();
  // 保存は順番に1つずつ送る（備考の入力欄から離れた直後に ○× を押すと2回送ることになるため。
  // ボタンは押せないようにしない＝押したのに効かない、を避ける）。
  const queue = useRef<Promise<void>>(Promise.resolve());

  // 再読み込みで提出内容が変わったら合わせる（レンダー中に派生 state を更新する React 推奨パターン）
  const [prevSubmission, setPrevSubmission] = useState(slot.submission);
  if (slot.submission !== prevSubmission) {
    setPrevSubmission(slot.submission);
    setCurrent(slot.submission?.available ?? null);
  }

  const noteDirty = note.trim() !== savedNote.trim();

  function send(available: boolean, kind: 'answer' | 'note') {
    const prev = current;
    setCurrent(available);
    const body = JSON.stringify({ available, note: note.trim() || undefined });
    queue.current = queue.current.then(async () => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/shifts/${slot.id}/submissions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? '保存に失敗しました');
          setCurrent(prev);
          return;
        }
        flash(kind === 'note' ? '備考を保存しました' : '保存しました');
        onSaved();
      } catch {
        setError('通信エラーが発生しました');
        setCurrent(prev);
      } finally {
        setSaving(false);
      }
    });
  }

  function saveNoteIfNeeded() {
    if (current !== null && noteDirty) send(current, 'note');
  }

  return (
    <div
      id={`slot-${slot.id}`}
      className={`scroll-mt-4 rounded border bg-white p-4 transition-shadow ${
        highlight && current === null ? 'border-l-4 border-l-amber-400' : ''
      } ${focused ? 'ring-2 ring-accent ring-offset-2' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <SlotHeading slot={slot} />
        {current === null && (
          <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
            未回答
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500">
        提出期限 {formatDeadlineJst(slot.deadline)} まで
      </p>
      {slot.note && <p className="mt-1 text-sm text-gray-500">{slot.note}</p>}

      <div className="mt-3 flex flex-col gap-2">
        <AnswerButtons current={current} onChoose={(v) => send(v, 'answer')} />
        <div className="flex gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNoteIfNeeded}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            maxLength={500}
            placeholder="備考（任意）"
            aria-label="備考"
            className="min-w-0 flex-1 rounded border px-3 py-2 text-sm"
          />
          {current !== null && noteDirty && (
            <button
              type="button"
              onClick={saveNoteIfNeeded}
              className="shrink-0 rounded bg-accent px-3 py-2 text-sm text-white"
            >
              備考を保存
            </button>
          )}
        </div>
        {current === null && noteDirty && (
          <p className="text-xs text-gray-500">
            ○ か × を押すと、備考も一緒に送られます。
          </p>
        )}
        {saving && <p className="text-sm text-gray-500">保存中…</p>}
        {!saving && <FlashMessage message={message} />}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

// 期限切れの枠（確定した役割に入っていないもの）。回答の確認と、出せる場合は欠席連絡。
function ExpiredCard({ slot, onSaved }: { slot: Slot; onSaved: () => void }) {
  const a = slot.submission?.available;
  return (
    <div className="rounded border bg-white p-4">
      <SlotHeading slot={slot} />
      <p className="mt-1 text-sm text-gray-600">
        あなたの回答:{' '}
        {a === undefined ? (
          <span className="text-gray-400">未回答</span>
        ) : a ? (
          <span className="font-bold text-green-700">○ 出られる</span>
        ) : (
          <span className="font-bold text-red-700">× 出られない</span>
        )}
        {slot.submission?.note && (
          <span className="ml-1 text-gray-500">（{slot.submission.note}）</span>
        )}
      </p>
      <AbsenceBox slot={slot} onSaved={onSaved} />
    </div>
  );
}

// 提出期限後の欠席連絡。期限後〜開始時刻前に、○で提出した人・確定済みの割り振りに
// 入っている人だけが出せる（判定はサーバー。ここは返ってきたフラグで出し分けるだけ）。
// 連絡はコアメンバー全員に LINE で届く。
// 確定した役割があるときはその役割のカードに、無いときは期限切れの枠のカードに出す。
function AbsenceBox({ slot, onSaved }: { slot: Slot; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(method: 'POST' | 'DELETE') {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/shifts/${slot.id}/absence`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify({ reason }) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? '送信に失敗しました');
        return;
      }
      const done =
        method === 'POST' ? '欠席を連絡しました' : '欠席連絡を取り消しました';
      // 誰に届いたかは後から確かめたいことなので、自動では消さない
      setMessage(
        data.notified > 0
          ? `${done}。コアメンバー ${data.notified} 人に LINE で知らせました。`
          : `${done}。LINE で知らせられたコアメンバーはいませんでしたが、アプリの一覧には出ています。`
      );
      setOpen(false);
      setReason('');
      onSaved();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSaving(false);
    }
  }

  const feedback = (
    <>
      {message && (
        <p className="mt-2 text-sm font-bold text-green-700">{message}</p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </>
  );

  if (slot.absence) {
    return (
      <div className="mt-2 rounded border border-red-200 bg-red-50 p-3 text-sm">
        <p className="font-bold text-red-800">欠席を連絡済み</p>
        <p className="mt-1 whitespace-pre-wrap text-gray-700">
          理由: {slot.absence.reason}
        </p>
        {slot.can_cancel_absence && (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              if (
                window.confirm(
                  '欠席連絡を取り消して、出勤する扱いに戻しますか？コアメンバーにも LINE で知らせます。'
                )
              ) {
                void send('DELETE');
              }
            }}
            className="mt-2 rounded border bg-white px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {saving ? '送信中…' : '取り消す（出勤できるようになった）'}
          </button>
        )}
        {feedback}
      </div>
    );
  }

  if (!slot.can_report_absence) return message || error ? feedback : null;

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 rounded border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700"
        >
          欠席を連絡する
        </button>
        {feedback}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded border border-red-200 bg-red-50 p-3">
      <p className="text-sm text-gray-700">
        理由を書いて送ると、コアメンバー全員に LINE で届きます。
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={ABSENCE_REASON_MAX}
        rows={3}
        placeholder="例: 体調不良のため"
        className="rounded border px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving || reason.trim() === ''}
          onClick={() => void send('POST')}
          className="flex-1 rounded bg-red-600 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? '送信中…' : '欠席を連絡する'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded border bg-white px-3 py-2 text-sm"
        >
          やめる
        </button>
      </div>
      {feedback}
    </div>
  );
}

// 未回答の枠をまとめて ○ / × にする。押した瞬間に保存（答えてある枠は変えない）。
function BulkAnswer({
  slots,
  onSaved,
}: {
  slots: Slot[];
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { message, flash } = useFlash();

  async function answerAll(available: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/shifts/submissions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: slots.map((s) => ({ shift_slot_id: s.id, available })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? '保存に失敗しました');
        return;
      }
      flash(`${data.saved}件を${available ? '○' : '×'}で保存しました`);
      onSaved();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded border border-amber-300 bg-amber-50 p-3">
      <p className="text-sm text-amber-900">
        未回答の {slots.length} 件をまとめて答える
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void answerAll(true)}
          className="flex-1 rounded border bg-white py-2 text-sm disabled:opacity-50"
        >
          全部 ○
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void answerAll(false)}
          className="flex-1 rounded border bg-white py-2 text-sm disabled:opacity-50"
        >
          全部 ×
        </button>
      </div>
      {saving && <p className="mt-2 text-sm text-gray-500">保存中…</p>}
      <FlashMessage message={message} className="mt-2" />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

// 折りたたみの見出しつきグループ（期限切れ・終わったシフト）
function Collapsible({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded border bg-white px-4 py-3 text-sm text-gray-600">
        <span>
          {title}（{count}件）
        </span>
        <span
          aria-hidden="true"
          className="text-gray-400 group-open:rotate-180"
        >
          ▼
        </span>
      </summary>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </details>
  );
}

// 確定した役割のカード。欠席連絡はここから出す（欠席するのは確定した予定なので）。
function RoleCard({
  role,
  slot,
  onSaved,
}: {
  role: MyRole;
  slot: Slot | undefined;
  onSaved: () => void;
}) {
  return (
    <li className="rounded border bg-white p-4">
      <SlotHeading slot={role} />
      <p className="mt-1">
        <RoleText roles={role.roles} noteClassName="text-sm text-gray-500" />
      </p>
      {slot && <AbsenceBox slot={slot} onSaved={onSaved} />}
    </li>
  );
}

function MyRoles({
  roles,
  slotsById,
  onSaved,
}: {
  roles: MyRole[];
  slotsById: Map<string, Slot>;
  onSaved: () => void;
}) {
  if (roles.length === 0) {
    return (
      <p className="text-sm text-gray-500">確定した予定はまだありません。</p>
    );
  }
  const today = todayJst();
  const upcoming = roles.filter((r) => r.date >= today);
  // 終わった分は新しい順（直近に終わったものが上）
  const past = roles.filter((r) => r.date < today).reverse();

  return (
    <div className="flex flex-col gap-3">
      {upcoming.length === 0 ? (
        <p className="text-sm text-gray-500">
          これからの確定した予定はありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {upcoming.map((r) => (
            <RoleCard
              key={r.slot_id}
              role={r}
              slot={slotsById.get(r.slot_id)}
              onSaved={onSaved}
            />
          ))}
        </ul>
      )}
      <Collapsible title="終わったシフト" count={past.length}>
        <ul className="flex flex-col gap-2">
          {past.map((r) => (
            <RoleCard
              key={r.slot_id}
              role={r}
              slot={undefined}
              onSaved={onSaved}
            />
          ))}
        </ul>
      </Collapsible>
    </div>
  );
}

// シフト画面。「希望を出す」と「確定した役割」を1画面の切り替えにまとめている
// （下部ナビのタブ数を減らして1つ1つを大きくするため）。
// 2026-11-24 見直し: 切り替えは1段だけ（「1件ずつ／まとめて」は廃止して1つの一覧に）、
// 未回答を上・期限切れは折りたたみ、欠席連絡は確定した役割のカードへ、切り替えは URL に残す。
export default function StaffShifts({
  myRoles,
  initialView = 'submit',
}: {
  myRoles: MyRole[];
  initialView?: View;
}) {
  const [view, setView] = useState<View>(initialView);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 開いた時点で未回答だった枠。答えてもその場では並びを変えない
  // （押したカードが別の場所へ飛んで行くと、保存できたか見失うため）。
  const [firstUnanswered, setFirstUnanswered] = useState<Set<string> | null>(
    null
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  // カレンダーの「答える」で移動してきた枠（数秒だけ枠を付ける）
  const [focusSlotId, setFocusSlotId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/shifts?scope=mine');
      if (!res.ok) {
        setError('読み込みに失敗しました');
        return;
      }
      const data = await res.json();
      const list: Slot[] = data.slots ?? [];
      setError(null);
      setSlots(list);
      setFirstUnanswered(
        (cur) =>
          cur ??
          new Set(
            list.filter((s) => !s.expired && !s.submission).map((s) => s.id)
          )
      );
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

  // 「答える」で移動したら、そのカードを画面の真ん中へ。枠は少しして消す
  useEffect(() => {
    if (!focusSlotId || view !== 'submit') return;
    const raf = requestAnimationFrame(() => {
      document
        .getElementById(`slot-${focusSlotId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const timer = setTimeout(() => setFocusSlotId(null), 2500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [focusSlotId, view]);

  function answerFromCalendar(slotId: string) {
    setCalendarOpen(false);
    changeView('submit');
    setFocusSlotId(slotId);
  }

  function changeView(next: View) {
    setView(next);
    // 再読み込み・戻るで同じ側が開くよう URL に残す（ネイティブの history API は Next のルーターと連動する）
    window.history.replaceState(
      null,
      '',
      next === 'roles' ? '/dashboard/shifts?view=roles' : '/dashboard/shifts'
    );
  }

  const roleSlotIds = new Set(myRoles.map((r) => r.slot_id));
  const slotsById = new Map(slots.map((s) => [s.id, s]));
  const unansweredSet = firstUnanswered ?? new Set<string>();
  const openSlots = slots
    .filter((s) => !s.expired)
    // 開いた時点で未回答だったものを上へ（同じグループ内は API の並び＝日付の近い順）
    .sort(
      (a, b) =>
        Number(unansweredSet.has(b.id)) - Number(unansweredSet.has(a.id))
    );
  const unansweredNow = openSlots.filter((s) => !s.submission);
  // 期限切れのうち、確定した役割に入っているものは役割側に出すのでここには出さない
  const expiredSlots = slots.filter((s) => s.expired && !roleSlotIds.has(s.id));
  const expiredActionable = expiredSlots.some(
    (s) => s.absence || s.can_report_absence
  );

  const calendarEntries = buildCalendarEntries(myRoles, slots);

  const tabs: { id: View; label: string; badge?: number }[] = [
    { id: 'submit', label: '希望を出す', badge: unansweredNow.length },
    { id: 'roles', label: '確定した役割' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">シフト</h1>
      <div className="flex items-stretch gap-2">
        <div
          role="tablist"
          className="flex flex-1 gap-1 rounded border bg-white p-1"
        >
          {tabs.map((t) => {
            const active = view === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => changeView(t.id)}
                className={`flex-1 rounded px-3 py-2.5 text-sm ${
                  active ? 'bg-accent font-bold text-white' : 'text-gray-600'
                }`}
              >
                {t.label}
                {!!t.badge && (
                  <span
                    className={`ml-1 rounded-full px-1.5 text-xs ${
                      active
                        ? 'bg-white text-accent'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {/* カレンダー（シフトのある日に色が付いた月表示）。一覧の右上の隅に置く */}
        <button
          type="button"
          onClick={() => setCalendarOpen(true)}
          aria-label="カレンダーで見る"
          title="カレンダーで見る"
          disabled={loading}
          className="flex w-12 shrink-0 items-center justify-center rounded border bg-white text-accent disabled:opacity-50"
        >
          <CalendarIcon className="h-6 w-6" />
        </button>
      </div>

      <ShiftCalendar
        open={calendarOpen}
        entries={calendarEntries}
        onClose={() => setCalendarOpen(false)}
        onAnswer={answerFromCalendar}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {view === 'roles' ? (
        <MyRoles roles={myRoles} slotsById={slotsById} onSaved={load} />
      ) : loading ? (
        <CardSkeleton count={2} />
      ) : (
        <>
          {slots.length === 0 && (
            <p className="text-sm text-gray-500">対象のシフトはありません。</p>
          )}
          {slots.length > 0 && openSlots.length === 0 && (
            <p className="text-sm text-gray-500">
              提出できる（期限内の）シフトはありません。
            </p>
          )}
          {unansweredNow.length >= 2 && (
            <BulkAnswer slots={unansweredNow} onSaved={load} />
          )}
          {openSlots.map((slot) => (
            <ShiftCard
              key={slot.id}
              slot={slot}
              highlight={unansweredSet.has(slot.id)}
              focused={focusSlotId === slot.id}
              onSaved={load}
            />
          ))}
          <Collapsible
            title="提出期限が過ぎた枠"
            count={expiredSlots.length}
            defaultOpen={expiredActionable}
          >
            {expiredSlots.map((slot) => (
              <ExpiredCard key={slot.id} slot={slot} onSaved={load} />
            ))}
          </Collapsible>
        </>
      )}
    </div>
  );
}
