// シフト画面のカレンダー用の純粋関数（`npm run test:shift` で回帰を見るため DB・画面に触らない）。
//
// 決めたこと（2026-11-24 本人回答）:
//   - 塗るのは「確定（濃い）」「○ で提出・未確定（薄い）」「期限内の未回答（枠線）」の3種類。
//     × で答えた枠・期限切れで確定していない枠は塗らない。
//   - 同じ日に複数あるときは強い方（確定 > ○ > 未回答）で塗る。

export type CalendarStatus = 'confirmed' | 'available' | 'unanswered';

export type CalendarEntry = {
  slotId: string;
  date: string; // 'YYYY-MM-DD'
  start_time: string;
  end_time: string;
  slot_type: 'day' | 'training';
  title: string | null;
  status: CalendarStatus;
  roles?: string[]; // 確定のときの役割（回の順）
  absence?: boolean; // 確定しているが欠席を連絡済み
};

type RoleInput = {
  slot_id: string;
  roles: string[];
  date: string;
  start_time: string;
  end_time: string;
  slot_type: 'day' | 'training';
  title: string | null;
};

type SlotInput = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  slot_type: 'day' | 'training';
  title?: string | null;
  expired: boolean;
  submission: { available: boolean } | null;
  absence?: unknown;
};

const RANK: Record<CalendarStatus, number> = {
  confirmed: 3,
  available: 2,
  unanswered: 1,
};

/**
 * 確定した役割と自分が対象の枠から、カレンダーに出す予定を作る（1枠1件・開始時刻順）。
 */
export function buildCalendarEntries(
  roles: RoleInput[],
  slots: SlotInput[]
): CalendarEntry[] {
  const slotsById = new Map(slots.map((s) => [s.id, s]));
  const entries: CalendarEntry[] = [];
  const confirmedIds = new Set<string>();

  for (const r of roles) {
    confirmedIds.add(r.slot_id);
    entries.push({
      slotId: r.slot_id,
      date: r.date,
      start_time: r.start_time,
      end_time: r.end_time,
      slot_type: r.slot_type,
      title: r.title,
      status: 'confirmed',
      roles: r.roles,
      absence: !!slotsById.get(r.slot_id)?.absence,
    });
  }

  for (const s of slots) {
    if (confirmedIds.has(s.id)) continue;
    let status: CalendarStatus | null = null;
    if (s.submission?.available === true) status = 'available';
    else if (!s.submission && !s.expired) status = 'unanswered';
    if (!status) continue;
    entries.push({
      slotId: s.id,
      date: s.date,
      start_time: s.start_time,
      end_time: s.end_time,
      slot_type: s.slot_type,
      title: s.title ?? null,
      status,
    });
  }

  return entries.sort((a, b) =>
    a.date !== b.date
      ? a.date < b.date
        ? -1
        : 1
      : a.start_time < b.start_time
        ? -1
        : a.start_time > b.start_time
          ? 1
          : 0
  );
}

export type DaySummary = {
  status: CalendarStatus; // いちばん強い状態
  count: number;
  absence: boolean;
};

/**
 * 日付ごとのまとめ（塗り方・件数・欠席連絡の印）。
 */
export function summarizeByDate(
  entries: CalendarEntry[]
): Map<string, DaySummary> {
  const map = new Map<string, DaySummary>();
  for (const e of entries) {
    const cur = map.get(e.date);
    if (!cur) {
      map.set(e.date, { status: e.status, count: 1, absence: !!e.absence });
    } else {
      cur.count++;
      if (RANK[e.status] > RANK[cur.status]) cur.status = e.status;
      if (e.absence) cur.absence = true;
    }
  }
  return map;
}

/**
 * 月のマス目（日曜始まり）。前月の空きは null。行数は必要なぶんだけ（4〜6行）。
 * @param month 1〜12
 */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: first }, () => null);
  const mm = String(month).padStart(2, '0');
  for (let d = 1; d <= days; d++)
    cells.push(`${year}-${mm}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * 月を足す（負で戻る）。{ year, month(1〜12) }
 */
export function addMonths(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const i = year * 12 + (month - 1) + delta;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}
