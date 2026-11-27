import type { SlotType } from '@/types';
import { DAY_ROLES, TRAINING_ROLES, NO_ROLE } from '@/types';

/**
 * slot_type に対応する役割一覧を返す。
 */
export function rolesForSlotType(slotType: SlotType): readonly string[] {
  return slotType === 'day' ? DAY_ROLES : TRAINING_ROLES;
}

/**
 * 役割割り振りアルゴリズム。
 *
 * 方針:
 *  1. available=true のユーザーだけを候補にする
 *  2. slot_type に応じた役割属性（dayRoles / trainingRoles）を参照
 *  3. 「担当可能人数が少ない順」に役割をソート（希少な役割から先に割り当て）
 *  4. 各役割について対応可能なユーザーからランダムに必要人数を選出（1人1役割）
 *  5. 役割が付かなかった available ユーザーも「役割なし」で出勤扱いにする
 *     （役割の指定はないが当日来る人を名簿・通知から漏らさないため）
 *
 * history（任意）: 人ごとの「これまでの回でその役割をした回数」。渡すと、同じ役割の
 * 回数が少ない人を先に選ぶ（同数の中ではランダム）。回ごとに役割を交代させるために使う
 * （assignRolesBySession）。渡さなければ今までどおり完全にランダム。
 */
export function assignRoles(
  slotType: SlotType,
  requirements: { role: string; requiredCount: number }[],
  submissions: { userId: string; available: boolean }[],
  users: { userId: string; dayRoles: string[]; trainingRoles: string[] }[],
  history?: Map<string, Map<string, number>>
): { userId: string; role: string }[] {
  // 1. available=true のユーザーだけ抽出
  const availableUserIds = new Set(
    submissions.filter((s) => s.available).map((s) => s.userId)
  );

  // 2. slot_type に応じた役割属性を参照
  const getRoles = (user: (typeof users)[0]) =>
    slotType === 'day' ? user.dayRoles : user.trainingRoles;

  // 3. 役割を「担当可能人数が少ない順」にソート
  const sortedReqs = requirements
    .filter((r) => r.requiredCount > 0)
    .sort((a, b) => {
      const countA = users.filter(
        (u) => availableUserIds.has(u.userId) && getRoles(u).includes(a.role)
      ).length;
      const countB = users.filter(
        (u) => availableUserIds.has(u.userId) && getRoles(u).includes(b.role)
      ).length;
      return countA - countB;
    });

  // 4. 各役割について、対応可能なユーザーからランダムに必要人数を選出
  const assigned = new Set<string>();
  const result: { userId: string; role: string }[] = [];

  for (const req of sortedReqs) {
    const candidates = users
      .filter(
        (u) =>
          availableUserIds.has(u.userId) &&
          !assigned.has(u.userId) &&
          getRoles(u).includes(req.role)
      )
      .map((u) => u.userId);

    // Fisher-Yates シャッフル
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    // その役割をした回数が少ない人を先に（sort は安定なので同数はシャッフル順のまま）
    if (history) {
      const times = (userId: string) => history.get(userId)?.get(req.role) ?? 0;
      candidates.sort((a, b) => times(a) - times(b));
    }

    const selected = candidates.slice(0, req.requiredCount);
    for (const userId of selected) {
      assigned.add(userId);
      result.push({ userId, role: req.role });
    }
  }

  // 5. 役割が付かなかった available ユーザーを「役割なし」で出勤扱いにする。
  for (const u of users) {
    if (availableUserIds.has(u.userId) && !assigned.has(u.userId)) {
      assigned.add(u.userId);
      result.push({ userId: u.userId, role: NO_ROLE });
    }
  }

  return result;
}

/**
 * 1日の中の回ごとの割り振り（migration 013）。
 *
 * ○×は枠単位なので、候補は全部の回で同じ。回ごとに assignRoles を回し、
 * 前の回までにその役割をした回数が少ない人を優先する＝なるべく役割を交代させる
 * （2026-11-27 本人回答）。その役割ができる人が足りなければ同じ人が続けて入る。
 * 各回で役割が付かなかった人は、その回「役割なし」になる（全部の回に1行ずつある）。
 */
export function assignRolesBySession(
  slotType: SlotType,
  sessionCount: number,
  requirements: { session: number; role: string; requiredCount: number }[],
  submissions: { userId: string; available: boolean }[],
  users: { userId: string; dayRoles: string[]; trainingRoles: string[] }[]
): { userId: string; session: number; role: string }[] {
  const history = new Map<string, Map<string, number>>();
  const result: { userId: string; session: number; role: string }[] = [];
  for (let session = 1; session <= Math.max(1, sessionCount); session++) {
    const reqs = requirements.filter((r) => r.session === session);
    for (const a of assignRoles(slotType, reqs, submissions, users, history)) {
      result.push({ ...a, session });
      if (a.role === NO_ROLE) continue;
      const h = history.get(a.userId) ?? new Map<string, number>();
      h.set(a.role, (h.get(a.role) ?? 0) + 1);
      history.set(a.userId, h);
    }
  }
  return result;
}
