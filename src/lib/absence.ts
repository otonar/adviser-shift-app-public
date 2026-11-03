// 欠席連絡（提出期限後の欠席）の判定と文面。DB に触らない純粋関数だけを置く
// （`npm run test:shift` で回帰を見るため。server-only にしない）。
//
// 決めたこと（2026-11-03 本人回答）:
//   - 連絡できるのは「提出期限を過ぎてから、シフトの開始時刻まで」。
//     期限前は今までどおり提出を × に変えれば済むので、欠席連絡は出さない。
//   - 連絡できるのは、その枠に ○ で提出した人、または確定済みの割り振りに入っている人。
//   - 割り振りは自動では外さない（コアメンバーが手で調整する）。
//   - 取り消しは連絡できる時間内なら本人ができる。取り消しもコアメンバーに知らせる。

import { NO_ROLE, SLOT_TYPE_LABEL, type SlotType } from '@/types';

// 理由の最大文字数（validators と画面で共有）
export const ABSENCE_REASON_MAX = 500;

type SlotTime = { date: string; start_time: string };

/**
 * シフトの開始時刻（JST）をミリ秒で返す。start_time は 'HH:MM' でも 'HH:MM:SS' でもよい。
 */
export function slotStartMs(slot: SlotTime): number {
  const hm = slot.start_time.slice(0, 5);
  return new Date(`${slot.date}T${hm}:00+09:00`).getTime();
}

export type AbsenceWindow = 'before_deadline' | 'open' | 'started';

/**
 * 欠席連絡の受付時間のどこにいるか。
 *   before_deadline: 提出期限前（提出を × に変えればよい）
 *   open:            期限後〜開始時刻前（連絡・取り消しができる）
 *   started:         開始時刻を過ぎた（もう連絡・取り消しはできない）
 */
export function absenceWindow(
  slot: SlotTime & { deadline: string },
  now: number = Date.now()
): AbsenceWindow {
  if (now >= slotStartMs(slot)) return 'started';
  if (now <= new Date(slot.deadline).getTime()) return 'before_deadline';
  return 'open';
}

/**
 * この人が欠席連絡を出せる立場か（時間は見ない）。
 * ○ で提出した、または確定済み（published）の割り振りに入っている。
 */
export function isAbsenceEligible(opts: {
  submittedAvailable: boolean | null;
  publishedAssigned: boolean;
}): boolean {
  return opts.submittedAvailable === true || opts.publishedAssigned;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * 'YYYY-MM-DD' を「M/D(曜)」に。
 */
export function formatSlotDateJa(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d}(${wd})`;
}

export type AbsenceMessageSlot = {
  date: string;
  start_time: string;
  end_time: string;
  slot_type: SlotType;
  title: string | null;
};

// 「11/10(火) 13:00〜16:00 当日 入学式」
function slotLine(slot: AbsenceMessageSlot): string {
  const time = `${slot.start_time.slice(0, 5)}〜${slot.end_time.slice(0, 5)}`;
  const title = slot.title ? ` ${slot.title}` : '';
  return `${formatSlotDateJa(slot.date)} ${time} ${SLOT_TYPE_LABEL[slot.slot_type]}${title}`;
}

/**
 * コアメンバーへ送る欠席連絡の文面。
 * role は確定済みの割り振りがあればその役割、無ければ null（役割の行を出さない）。
 */
export function buildAbsenceMessage(opts: {
  name: string;
  slot: AbsenceMessageSlot;
  role: string | null;
  reason: string;
}): string {
  const lines = [`【欠席連絡】${opts.name}さん`, slotLine(opts.slot)];
  if (opts.role !== null) {
    lines.push(opts.role === NO_ROLE ? '役割: 指定なし（出勤のみ）' : `役割: ${opts.role}`);
  }
  lines.push(`理由: ${opts.reason}`);
  lines.push('', 'アプリの「欠席連絡」で一覧を見られます。割り振りの調整が必要なら対応してください。');
  return lines.join('\n');
}

/**
 * 欠席連絡を本人が取り消したときの文面。
 */
export function buildAbsenceCancelMessage(opts: {
  name: string;
  slot: AbsenceMessageSlot;
}): string {
  return [
    `【欠席連絡の取り消し】${opts.name}さん`,
    slotLine(opts.slot),
    '欠席の連絡が取り消されました（出勤できるようになりました）。割り振りを確認してください。',
  ].join('\n');
}
