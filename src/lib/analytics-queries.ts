import 'server-only';
import { getSupabaseAdmin } from './supabase';
import {
  computeAnalytics,
  type Analytics,
  type AnalyticsInput,
  type SlotRow,
  type UserRow,
  type TargetRow,
  type SubmissionRow,
  type RequirementRow,
  type AssignmentRow,
} from './analytics';

// 分析ダッシュボード（/admin/analytics）のデータ取得。
// テーブルごとに1回ずつ、計6クエリを並列で引いて、集計は analytics.ts に任せる。
// 取得に失敗したら throw する（画面側で「読み込みに失敗しました」を出す）。

export type { Analytics };

export async function fetchAnalytics(): Promise<Analytics> {
  const supabase = getSupabaseAdmin();

  const [users, slots, targets, submissions, requirements, assignments] =
    await Promise.all([
      supabase.from('users').select('id, name, is_active'),
      supabase
        .from('shift_slots')
        .select('id, date, start_time, end_time, slot_type, deadline, assignment_status'),
      supabase.from('shift_target_users').select('shift_slot_id, user_id'),
      supabase.from('shift_submissions').select('shift_slot_id, user_id, available'),
      supabase
        .from('shift_role_requirements')
        .select('shift_slot_id, role, required_count'),
      supabase.from('shift_assignments').select('shift_slot_id, user_id, role'),
    ]);

  for (const r of [users, slots, targets, submissions, requirements, assignments]) {
    if (r.error) throw new Error('分析用データの取得に失敗しました');
  }

  const input: AnalyticsInput = {
    userRows: (users.data ?? []) as UserRow[],
    slotRows: (slots.data ?? []) as SlotRow[],
    targetRows: (targets.data ?? []) as TargetRow[],
    submissionRows: (submissions.data ?? []) as SubmissionRow[],
    requirementRows: (requirements.data ?? []) as RequirementRow[],
    assignmentRows: (assignments.data ?? []) as AssignmentRow[],
  };

  return computeAnalytics(input);
}
