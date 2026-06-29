import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { runAssignmentSchema } from '@/lib/validators';
import { assignRoles } from '@/lib/role-assignment';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';
import type { SlotType } from '@/types';

// POST: 自動割り振り実行（管理者）。結果を保存し status を 'draft' に。
async function postHandler(req: Request) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const parsed = await parseBody(req, runAssignmentSchema);
  if (!parsed.ok) return parsed.response;
  const { shift_slot_id } = parsed.data;

  const supabase = getSupabaseAdmin();

  const { data: slot } = await supabase
    .from('shift_slots')
    .select('id, slot_type')
    .eq('id', shift_slot_id)
    .maybeSingle();
  if (!slot) return jsonError('シフト枠が見つかりません', 404, 'NOT_FOUND');

  const { data: roleReqs } = await supabase
    .from('shift_role_requirements')
    .select('role, required_count')
    .eq('shift_slot_id', shift_slot_id);

  // 対象スタッフ（役割属性込み）
  const { data: targetRows } = await supabase
    .from('shift_target_users')
    .select('user_id, users(id, day_roles, training_roles)')
    .eq('shift_slot_id', shift_slot_id);

  const { data: subs } = await supabase
    .from('shift_submissions')
    .select('user_id, available')
    .eq('shift_slot_id', shift_slot_id);

  const users = (targetRows ?? []).map((t) => {
    const u = Array.isArray(t.users) ? t.users[0] : t.users;
    return {
      userId: t.user_id,
      dayRoles: u?.day_roles ?? [],
      trainingRoles: u?.training_roles ?? [],
    };
  });

  const result = assignRoles(
    slot.slot_type as SlotType,
    (roleReqs ?? []).map((r) => ({
      role: r.role,
      requiredCount: r.required_count,
    })),
    (subs ?? []).map((s) => ({ userId: s.user_id, available: s.available })),
    users
  );

  // 既存を全削除 → 挿入
  const { error: delError } = await supabase
    .from('shift_assignments')
    .delete()
    .eq('shift_slot_id', shift_slot_id);
  if (delError) return jsonError('割り振りの保存に失敗しました', 500, 'ASSIGN_FAILED');

  if (result.length > 0) {
    const rows = result.map((r) => ({
      shift_slot_id,
      user_id: r.userId,
      role: r.role,
    }));
    const { error } = await supabase.from('shift_assignments').insert(rows);
    if (error) return jsonError('割り振りの保存に失敗しました', 500, 'ASSIGN_FAILED');
  }

  await supabase
    .from('shift_slots')
    .update({ assignment_status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', shift_slot_id);

  return jsonOk({ ok: true, assigned: result.length });
}

export const POST = withRoute(postHandler);
