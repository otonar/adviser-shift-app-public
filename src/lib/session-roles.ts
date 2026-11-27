// 1日の中の「回」ごとの役割（migration 013）を扱う純粋関数。
// 画面・LINE の文面・API の検証で同じ表記・同じ決まりを使うため1か所に集める
// （`npm run test:shift` で回帰を見る。server-only にしない）。
//
// 決まり（2026-11-27 本人回答）:
//   - 回は枠ごとに回数だけ（1〜MAX_SESSIONS）。表示は「1回目」「2回目」…
//   - ○×は枠（日）単位。割り振りに入った人は、その枠の全部の回に1つずつ役割を持つ
//     （役割が無い回は「役割なし」）。
//   - 回数が1の枠は今までどおりの見た目・文面にする。

import { NO_ROLE } from '@/types';

export const MAX_SESSIONS = 10;

export function sessionLabel(session: number): string {
  return `${session}回目`;
}

/** 1..count の配列 */
export function sessionNumbers(count: number): number[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => i + 1);
}

/** DB の行（session は列が無い古いデータでも 1 とみなす）を、人ごとの「回の順の役割」にまとめる */
export function groupRolesByUser<
  T extends { userId: string; session?: number | null; role: string },
>(rows: T[]): Map<string, string[]> {
  const sorted = [...rows].sort((a, b) => (a.session ?? 1) - (b.session ?? 1));
  const map = new Map<string, string[]>();
  for (const r of sorted) {
    const list = map.get(r.userId) ?? [];
    list.push(r.role);
    map.set(r.userId, list);
  }
  return map;
}

/** 全部の回が同じ役割ならその役割、違えば null */
export function uniformRole(roles: readonly string[]): string | null {
  if (roles.length === 0) return null;
  return roles.every((r) => r === roles[0]) ? roles[0] : null;
}

function inlineRole(role: string): string {
  return role === NO_ROLE ? '指定なし' : `「${role}」`;
}

/** 「1回目「加入」・2回目「受付」・3回目 指定なし」 */
export function sessionRolesInline(roles: readonly string[]): string {
  return roles
    .map(
      (r, i) =>
        `${sessionLabel(i + 1)}${r === NO_ROLE ? ' ' : ''}${inlineRole(r)}`
    )
    .join('・');
}

/**
 * 一覧・LINE 返信で使う1行の表記。
 *   全回同じ「役割なし」 → 「役割の指定なし」
 *   全回同じ役割         → 「役割: 受付」
 *   回で違う             → 「役割: 1回目「加入」・2回目「受付」」
 */
export function rolesSummary(roles: readonly string[]): string {
  const u = uniformRole(roles);
  if (u === NO_ROLE) return '役割の指定なし';
  if (u !== null) return `役割: ${u}`;
  return `役割: ${sessionRolesInline(roles)}`;
}

/**
 * 割り振り（PATCH・差し替え）の形を確かめる。問題があれば画面に出す文、無ければ null。
 * 入っている人は 1..sessionCount の回を1つずつ、ちょうど全部持っていること。
 */
export function validateSessionAssignments(
  entries: { userId: string; session: number; role: string }[],
  sessionCount: number
): string | null {
  const byUser = new Map<string, Set<number>>();
  for (const e of entries) {
    if (
      !Number.isInteger(e.session) ||
      e.session < 1 ||
      e.session > sessionCount
    ) {
      return 'この枠に無い回が入っています';
    }
    const set = byUser.get(e.userId) ?? new Set<number>();
    if (set.has(e.session)) return '同じ人が同じ回に2回入っています';
    set.add(e.session);
    byUser.set(e.userId, set);
  }
  for (const set of byUser.values()) {
    if (set.size !== sessionCount) return '全部の回の役割を決めてください';
  }
  return null;
}
