import type { SlotType } from '@/types';
import { DAY_ROLES, TRAINING_ROLES } from '@/types';

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
 */
export function assignRoles(
  slotType: SlotType,
  requirements: { role: string; requiredCount: number }[],
  submissions: { userId: string; available: boolean }[],
  users: { userId: string; dayRoles: string[]; trainingRoles: string[] }[]
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

    const selected = candidates.slice(0, req.requiredCount);
    for (const userId of selected) {
      assigned.add(userId);
      result.push({ userId, role: req.role });
    }
  }

  return result;
}
