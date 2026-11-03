// 割り振りの差分と、割り振りに関する LINE の文面。DB に触らない純粋関数だけを置く
// （`npm run test:shift` で回帰を見るため。server-only にしない）。
//
// 公開（publish）時の「シフト確定」と、公開後の差し替え（swap）で同じ文面を使う。
// 差し替えでは変更があった人にだけ送る（2026-11-03 本人回答）:
//   追加 → 「シフト確定」／外れた → 「シフトから外れました」／役割変更 → 「役割が変わりました」

import { NO_ROLE } from '@/types';

export type AssignmentEntry = { userId: string; role: string };

export type AssignmentDiff = {
  added: AssignmentEntry[];
  removed: AssignmentEntry[];
  changed: { userId: string; from: string; to: string }[];
};

/**
 * 変更前と変更後の割り振りを比べる（1人1役割の前提。user_id で突き合わせる）。
 */
export function diffAssignments(
  before: AssignmentEntry[],
  after: AssignmentEntry[]
): AssignmentDiff {
  const beforeBy = new Map(before.map((a) => [a.userId, a.role]));
  const afterBy = new Map(after.map((a) => [a.userId, a.role]));
  const diff: AssignmentDiff = { added: [], removed: [], changed: [] };
  for (const a of after) {
    const prev = beforeBy.get(a.userId);
    if (prev === undefined) diff.added.push(a);
    else if (prev !== a.role) diff.changed.push({ userId: a.userId, from: prev, to: a.role });
  }
  for (const b of before) {
    if (!afterBy.has(b.userId)) diff.removed.push(b);
  }
  return diff;
}

export function hasChanges(diff: AssignmentDiff): boolean {
  return diff.added.length + diff.removed.length + diff.changed.length > 0;
}

type SlotForMessage = {
  date: string;
  start_time: string;
  end_time: string;
  title: string | null;
};

/**
 * 「2026-11-10 13:00〜16:00 入学式」（タイトルがあれば何の枠かも伝える）
 */
export function slotWhen(slot: SlotForMessage): string {
  const time = `${slot.start_time.slice(0, 5)}〜${slot.end_time.slice(0, 5)}`;
  return `${slot.date} ${time}${slot.title ? ` ${slot.title}` : ''}`;
}

function roleText(role: string): string {
  return role === NO_ROLE ? '役割の指定なし' : `「${role}」`;
}

/** 公開時・差し替えで追加されたとき */
export function confirmedMessage(when: string, role: string): string {
  return role === NO_ROLE
    ? `シフト確定: ${when} 出勤です（役割の指定はありません）`
    : `シフト確定: ${when} あなたの役割は「${role}」です`;
}

/** 差し替えで外れたとき */
export function removedMessage(when: string): string {
  return `シフト変更: ${when} のシフトから外れました（出勤しなくて大丈夫です）`;
}

/** 差し替えで役割が変わったとき */
export function roleChangedMessage(when: string, from: string, to: string): string {
  return `シフト変更: ${when} あなたの役割が${roleText(from)}から${roleText(to)}に変わりました`;
}
