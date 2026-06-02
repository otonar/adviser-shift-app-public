import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin, authenticateUser } from '@/lib/middleware';
import { manualAssignmentSchema } from '@/lib/validators';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

type Params = { params: Promise<{ shiftId: string }> };

// GET: 割り振り結果。管理者は全員分、一般スタッフは published のときのみ自分の分。
async function getHandler(_req: Request, { params }: Params) {
  const slotId = (await params).shiftId;

  const admin = await authenticateAdmin();
  if (admin.ok) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('shift_assignments')
      .select('user_id, role, users(name)')
      .eq('shift_slot_id', slotId);
    const assignments = (data ?? []).map((a) => {
      const u = Array.isArray(a.users) ? a.users[0] : a.users;
      return { user_id: a.user_id, name: u?.name ?? '(不明)', role: a.role };
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
    .eq('user_id', user.userId);

  return jsonOk({ roles: (data ?? []).map((a) => a.role) });
}

// PATCH: 手動調整（管理者）。既存を全削除 → 新しい割り振りを挿入。status は draft のまま。
async function patchHandler(req: Request, { params }: Params) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const parsed = await parseBody(req, manualAssignmentSchema);
  if (!parsed.ok) return parsed.response;
  const { assignments } = parsed.data;

  const supabase = getSupabaseAdmin();
  const slotId = (await params).shiftId;

  await supabase
    .from('shift_assignments')
    .delete()
    .eq('shift_slot_id', slotId);

  if (assignments.length > 0) {
    const rows = assignments.map((a) => ({
      shift_slot_id: slotId,
      user_id: a.userId,
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
