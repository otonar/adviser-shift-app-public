// 割り振りの差分と、割り振りに関する LINE の文面。DB に触らない純粋関数だけを置く
// （`npm run test:shift` で回帰を見るため。server-only にしない）。
//
// 公開（publish）時の「シフト確定」と、公開後の差し替え（swap）で同じ文面を使う。
// 差し替えでは変更があった人にだけ送る（2026-11-03 本人回答）:
//   追加 → 「シフト確定」／外れた → 「シフトから外れました」／役割変更 → 「役割が変わりました」
//
// 1日の中の回（migration 013）: 1人が回の数だけ行を持つ。差分・文面は人ごとに
// 「回の順の役割の並び」（roles）で扱う。回数1の枠では今までと同じ文面になる。

import { NO_ROLE } from '@/types';
import { groupRolesByUser, sessionRolesInline, uniformRole } from './session-roles';

/** DB の1行。session を省くと 1回目（回数1の枠） */
export type AssignmentEntry = { userId: string; session?: number; role: string };

/** 1人ぶん。roles は回の順（roles[0] が 1回目） */
export type UserRoles = { userId: string; roles: string[] };

export type AssignmentDiff = {
  added: UserRoles[];
  removed: UserRoles[];
  changed: { userId: string; from: string[]; to: string[] }[];
};

function sameRoles(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((r, i) => r === b[i]);
}

/**
 * 変更前と変更後の割り振りを人ごとに比べる（user_id で突き合わせ、どれかの回の役割が
 * 違えば「役割変更」）。
 */
export function diffAssignments(
  before: AssignmentEntry[],
  after: AssignmentEntry[]
): AssignmentDiff {
  const beforeBy = groupRolesByUser(before);
  const afterBy = groupRolesByUser(after);
  const diff: AssignmentDiff = { added: [], removed: [], changed: [] };
  for (const [userId, roles] of afterBy) {
    const prev = beforeBy.get(userId);
    if (prev === undefined) diff.added.push({ userId, roles });
    else if (!sameRoles(prev, roles)) diff.changed.push({ userId, from: prev, to: roles });
  }
  for (const [userId, roles] of beforeBy) {
    if (!afterBy.has(userId)) diff.removed.push({ userId, roles });
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

/**
 * 公開時・差し替えで追加されたとき。roles は回の順。
 * 全部の回が同じ役割なら今までどおりの文面、回で違えば回ごとに並べる。
 */
export function confirmedMessage(when: string, roles: readonly string[]): string {
  const u = uniformRole(roles);
  if (u === NO_ROLE) return `シフト確定: ${when} 出勤です（役割の指定はありません）`;
  if (u !== null) return `シフト確定: ${when} あなたの役割は「${u}」です`;
  const list = sessionRolesInline(roles);
  // 「…「受付」です」／「…2回目 指定なし です」
  return `シフト確定: ${when} あなたの役割は ${list}${list.endsWith('」') ? '' : ' '}です`;
}

/** 差し替えで外れたとき */
export function removedMessage(when: string): string {
  return `シフト変更: ${when} のシフトから外れました（出勤しなくて大丈夫です）`;
}

/** 差し替えで役割が変わったとき（どれかの回）。from/to は回の順 */
export function roleChangedMessage(
  when: string,
  from: readonly string[],
  to: readonly string[]
): string {
  const uf = uniformRole(from);
  const ut = uniformRole(to);
  if (uf !== null && ut !== null) {
    return `シフト変更: ${when} あなたの役割が${roleText(uf)}から${roleText(ut)}に変わりました`;
  }
  return `シフト変更: ${when} あなたの役割が変わりました。変更後: ${sessionRolesInline(to)}`;
}
