import { isExpired } from './datetime';
import { NO_ROLE, type SlotType } from '@/types';

// 分析ダッシュボードの集計ロジック（DB には触らない純粋な計算）。
//
// クエリ（analytics-queries.ts）と分けてあるのは、**数字が静かに間違っても
// 気づけない**種類のコードだから。ここを DB から切り離しておけば、
// 作った入力に対して期待どおりの数字が出るかを機械的に確かめられる。
//
// 集計は SQL ではなく JS で行う。スタッフ50名・枠は多くても数十という規模なので
// 全件取っても軽く、生 SQL を書かずに済む（CLAUDE.md の方針）。

export type SlotRow = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  slot_type: SlotType;
  deadline: string;
  assignment_status: 'open' | 'draft' | 'published';
};

export type UserRow = { id: string; name: string; is_active: boolean };
export type TargetRow = { shift_slot_id: string; user_id: string };
export type SubmissionRow = {
  shift_slot_id: string;
  user_id: string;
  available: boolean;
};
export type RequirementRow = {
  shift_slot_id: string;
  role: string;
  required_count: number;
};
export type AssignmentRow = {
  shift_slot_id: string;
  user_id: string;
  role: string;
};

export type AnalyticsInput = {
  userRows: UserRow[];
  slotRows: SlotRow[];
  targetRows: TargetRow[];
  submissionRows: SubmissionRow[];
  requirementRows: RequirementRow[];
  assignmentRows: AssignmentRow[];
};

/** 受付中（open）の枠ごとの提出状況。締切が近い順。 */
export type SlotSubmissionRow = {
  slotId: string;
  date: string;
  startTime: string;
  endTime: string;
  slotType: SlotType;
  deadline: string;
  expired: boolean;
  targetCount: number;
  submittedCount: number;
  /** まだ出していない人の名前（脱退者は除く）。 */
  notSubmitted: string[];
};

/** メンバーごとの提出率（締切が過ぎた枠だけを分母にする）。 */
export type MemberSubmissionRow = {
  userId: string;
  name: string;
  targeted: number;
  submitted: number;
};

/** メンバーごとの役割の割り当て回数（確定済みの枠のみ）。 */
export type RoleBalanceRow = {
  userId: string;
  name: string;
  total: number;
  /** 役割名 → 回数。 */
  byRole: Record<string, number>;
};

/** 役割ごとの必要人数と実際の割り当て（調整中・確定の枠が対象）。 */
export type RoleShortfallRow = {
  role: string;
  slotType: SlotType;
  required: number;
  assigned: number;
  /** 足りていない枠の数。 */
  shortSlots: number;
};

export type Analytics = {
  /** 集計の母数になった枠の数。 */
  totalSlots: number;
  activeMemberCount: number;
  openSlots: SlotSubmissionRow[];
  members: MemberSubmissionRow[];
  roleBalance: RoleBalanceRow[];
  shortfalls: RoleShortfallRow[];
  /** 締切が過ぎた枠での全体の提出率の分母・分子。 */
  overall: { targeted: number; submitted: number };
};

export function computeAnalytics(input: AnalyticsInput): Analytics {
  const {
    userRows,
    slotRows,
    targetRows,
    submissionRows,
    requirementRows,
    assignmentRows,
  } = input;

  const nameById = new Map(userRows.map((u) => [u.id, u.name]));
  const activeUsers = userRows.filter((u) => u.is_active);
  const activeIds = new Set(activeUsers.map((u) => u.id));
  const slotById = new Map(slotRows.map((s) => [s.id, s]));

  // 「この枠でこの人は出したか」を引けるようにしておく
  const submittedKeys = new Set(
    submissionRows.map((s) => `${s.shift_slot_id}:${s.user_id}`)
  );

  // 枠ごとの対象者
  const targetsBySlot = new Map<string, string[]>();
  for (const t of targetRows) {
    const list = targetsBySlot.get(t.shift_slot_id);
    if (list) list.push(t.user_id);
    else targetsBySlot.set(t.shift_slot_id, [t.user_id]);
  }

  // --- 1. 受付中の枠ごとの提出状況 ---------------------------------------
  const openSlots: SlotSubmissionRow[] = slotRows
    .filter((s) => s.assignment_status === 'open')
    .map((s) => {
      const targetIds = targetsBySlot.get(s.id) ?? [];
      const notSubmitted = targetIds
        .filter((id) => !submittedKeys.has(`${s.id}:${id}`))
        // 脱退した人は追いかけても仕方ないので出さない
        .filter((id) => activeIds.has(id))
        .map((id) => nameById.get(id) ?? '(不明)')
        .sort((a, b) => a.localeCompare(b, 'ja'));
      // 脱退者は分母からも外す（未提出に出さないのに分母に残ると 100% にならない）
      const activeTargets = targetIds.filter((id) => activeIds.has(id));
      return {
        slotId: s.id,
        date: s.date,
        startTime: s.start_time,
        endTime: s.end_time,
        slotType: s.slot_type,
        deadline: s.deadline,
        expired: isExpired(s.deadline),
        targetCount: activeTargets.length,
        submittedCount: activeTargets.length - notSubmitted.length,
        notSubmitted,
      };
    })
    .sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0));

  // --- 2. メンバーごとの提出率 -------------------------------------------
  // 分母は「締切が過ぎた枠」だけ。これから出せる枠を未提出に数えると実態とずれる。
  const closedSlotIds = new Set(
    slotRows.filter((s) => isExpired(s.deadline)).map((s) => s.id)
  );
  const memberStats = new Map<string, { targeted: number; submitted: number }>();
  for (const t of targetRows) {
    if (!closedSlotIds.has(t.shift_slot_id)) continue;
    const cur = memberStats.get(t.user_id) ?? { targeted: 0, submitted: 0 };
    cur.targeted += 1;
    if (submittedKeys.has(`${t.shift_slot_id}:${t.user_id}`)) cur.submitted += 1;
    memberStats.set(t.user_id, cur);
  }
  const members: MemberSubmissionRow[] = activeUsers
    .map((u) => {
      const s = memberStats.get(u.id) ?? { targeted: 0, submitted: 0 };
      return { userId: u.id, name: u.name, ...s };
    })
    // 対象になったことがある人だけ。提出率の低い順＝声をかける順に並べる
    .filter((m) => m.targeted > 0)
    .sort((a, b) => {
      const ra = a.submitted / a.targeted;
      const rb = b.submitted / b.targeted;
      if (ra !== rb) return ra - rb;
      return b.targeted - a.targeted;
    });

  const overall = members.reduce(
    (acc, m) => ({
      targeted: acc.targeted + m.targeted,
      submitted: acc.submitted + m.submitted,
    }),
    { targeted: 0, submitted: 0 }
  );

  // --- 3. 役割の偏り（確定済みの枠のみ） ---------------------------------
  const publishedSlotIds = new Set(
    slotRows.filter((s) => s.assignment_status === 'published').map((s) => s.id)
  );
  const balance = new Map<string, Record<string, number>>();
  for (const a of assignmentRows) {
    if (!publishedSlotIds.has(a.shift_slot_id)) continue;
    const byRole = balance.get(a.user_id) ?? {};
    byRole[a.role] = (byRole[a.role] ?? 0) + 1;
    balance.set(a.user_id, byRole);
  }
  const roleBalance: RoleBalanceRow[] = activeUsers
    .map((u) => {
      const byRole = balance.get(u.id) ?? {};
      const total = Object.values(byRole).reduce((a, b) => a + b, 0);
      return { userId: u.id, name: u.name, total, byRole };
    })
    // 回数の多い順。末尾に「一度も割り振られていない人」が並ぶのが見どころ
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ja'));

  // --- 4. 欠員傾向 --------------------------------------------------------
  // 必要人数（required_count）に対して、実際に割り振れた人数がどれだけ足りたか。
  // 対象は「割り振りが済んでいる枠」＝ draft と published（open はまだ割り振り前）。
  const assignedCount = new Map<string, number>(); // `${slotId}:${role}` → 人数
  for (const a of assignmentRows) {
    if (a.role === NO_ROLE) continue; // 役割なしは必要人数の充足に数えない
    // 脱退した人は「埋まっている」に数えない。脱退しても割り振りの行は残るので、
    // 数えてしまうと実際は欠員なのに充足して見える（＝欠員に気づけなくなる）。
    if (!activeIds.has(a.user_id)) continue;
    const key = `${a.shift_slot_id}:${a.role}`;
    assignedCount.set(key, (assignedCount.get(key) ?? 0) + 1);
  }
  const shortfallMap = new Map<string, RoleShortfallRow>();
  for (const r of requirementRows) {
    const slot = slotById.get(r.shift_slot_id);
    if (!slot) continue;
    if (slot.assignment_status === 'open') continue;
    if (r.required_count <= 0) continue;

    const assigned = assignedCount.get(`${r.shift_slot_id}:${r.role}`) ?? 0;
    const key = `${slot.slot_type}:${r.role}`;
    const cur =
      shortfallMap.get(key) ??
      ({
        role: r.role,
        slotType: slot.slot_type,
        required: 0,
        assigned: 0,
        shortSlots: 0,
      } satisfies RoleShortfallRow);
    cur.required += r.required_count;
    // 必要人数より多く入っている枠が、他の枠の不足を埋めて見えないようにする
    cur.assigned += Math.min(assigned, r.required_count);
    if (assigned < r.required_count) cur.shortSlots += 1;
    shortfallMap.set(key, cur);
  }
  const shortfalls = [...shortfallMap.values()].sort((a, b) => {
    // 足りていない量が大きい順
    const da = a.required - a.assigned;
    const db = b.required - b.assigned;
    return db - da || a.role.localeCompare(b.role, 'ja');
  });

  return {
    totalSlots: slotRows.length,
    activeMemberCount: activeUsers.length,
    openSlots,
    members,
    roleBalance,
    shortfalls,
    overall,
  };
}
