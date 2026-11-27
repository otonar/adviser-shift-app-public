import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin, authenticateUser } from '@/lib/middleware';
import { manualAssignmentSchema } from '@/lib/validators';
import { validateSessionAssignments } from '@/lib/session-roles';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute, isUuid, notFound } from '@/lib/http';

type Params = { params: Promise<{ shiftId: string }> };

// GET: 割り振り結果。管理者は全員分、一般スタッフは published のときのみ自分の分。
async function getHandler(_req: Request, { params }: Params) {
  const slotId = (await params).shiftId;
  if (!isUuid(slotId)) return notFound('シフト枠が見つかりません');

  const admin = await authenticateAdmin();
  if (admin.ok) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('shift_assignments')
      .select('user_id, session, role, users(name)')
      .eq('shift_slot_id', slotId)
      .order('session', { ascending: true });
    const assignments = (data ?? []).map((a) => {
      const u = Array.isArray(a.users) ? a.users[0] : a.users;
      return { user_id: a.user_id, name: u?.name ?? '(不明)', session: a.session ?? 1, role: a.role };
    });
    return jsonOk({ assignments });
  }

  const user = await authenticateUser();
  if (!user.ok) return user.response;

  const supabase = getSupabaseAdmin();
  const { data: slot } = await supabase
    .from('shift_slots')
    .select('assignment_status')
    .eq('id', slotId)
    .maybeSingle();
  if (!slot || slot.assignment_status !== 'published') {
    return jsonError('まだ公開されていません', 403, 'NOT_PUBLISHED');
  }

  const { data } = await supabase
    .from('shift_assignments')
    .select('role')
    .eq('shift_slot_id', slotId)
    .eq('user_id', user.userId)
    .order('session', { ascending: true });

  // 回の順（1回目, 2回目…）
  return jsonOk({ roles: (data ?? []).map((a) => a.role) });
}

// PATCH: 手動調整（管理者）。既存を全削除 → 新しい割り振りを挿入。status は draft のまま。
async function patchHandler(req: Request, { params }: Params) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const slotId = (await params).shiftId;
  if (!isUuid(slotId)) return notFound('シフト枠が見つかりません');

  const parsed = await parseBody(req, manualAssignmentSchema);
  if (!parsed.ok) return parsed.response;
  // session の既定（1）は zod が入れるが、型の上では省略可のままなので揃える
  const assignments = parsed.data.assignments.map((a) => ({ ...a, session: a.session ?? 1 }));

  const supabase = getSupabaseAdmin();

  // 入っている人は全部の回に1つずつ役割を持つこと（役割が無い回は「役割なし」）
  const { data: slot, error: slotErr } = await supabase
    .from('shift_slots')
    .select('session_count')
    .eq('id', slotId)
    .maybeSingle();
  if (slotErr) return jsonError('保存に失敗しました', 500, 'SAVE_FAILED');
  if (!slot) return notFound('シフト枠が見つかりません');
  const invalid = validateSessionAssignments(assignments, slot.session_count ?? 1);
  if (invalid) return jsonError(invalid, 400, 'INVALID_SESSIONS');

  const { error: delError } = await supabase
    .from('shift_assignments')
    .delete()
    .eq('shift_slot_id', slotId);
  if (delError) return jsonError('保存に失敗しました', 500, 'SAVE_FAILED');

  if (assignments.length > 0) {
    const rows = assignments.map((a) => ({
      shift_slot_id: slotId,
      user_id: a.userId,
      session: a.session,
      role: a.role,
    }));
    const { error } = await supabase.from('shift_assignments').insert(rows);
    if (error) return jsonError('保存に失敗しました', 500, 'SAVE_FAILED');
  }

  // draft のまま（未公開）に保つ
  await supabase
    .from('shift_slots')
    .update({ assignment_status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', slotId);

  return jsonOk({ ok: true });
}

export const GET = withRoute(getHandler);
export const PATCH = withRoute(patchHandler);
