import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { updateShiftSchema } from '@/lib/validators';
import { computeDeadline } from '@/lib/datetime';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

type Params = { params: { id: string } };

// GET: シフト枠詳細（管理者）。対象者・提出状況・必要人数・割り振りをまとめて返す。
async function getHandler(_req: Request, { params }: Params) {
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const supabase = getSupabaseAdmin();
  const slotId = params.id;

  const { data: slot, error } = await supabase
    .from('shift_slots')
    .select('*')
    .eq('id', slotId)
    .maybeSingle();
  if (error) return jsonError('取得に失敗しました', 500, 'FETCH_FAILED');
  if (!slot) return jsonError('シフト枠が見つかりません', 404, 'NOT_FOUND');

  // 対象スタッフ（ユーザー情報込み）
  const { data: targetRows } = await supabase
    .from('shift_target_users')
    .select('user_id, users(id, name, day_roles, training_roles)')
    .eq('shift_slot_id', slotId);

  // 提出状況
  const { data: subs } = await supabase
    .from('shift_submissions')
    .select('user_id, available, note')
    .eq('shift_slot_id', slotId);
  const subByUser = new Map((subs ?? []).map((s) => [s.user_id, s]));

  // 役割別必要人数
  const { data: roleReqs } = await supabase
    .from('shift_role_requirements')
    .select('role, required_count')
    .eq('shift_slot_id', slotId);

  // 割り振り結果（ユーザー名込み）
  const { data: assignRows } = await supabase
    .from('shift_assignments')
    .select('user_id, role, users(name)')
    .eq('shift_slot_id', slotId);

  // 対象スタッフごとに提出状況をマージ
  const targets = (targetRows ?? []).map((t) => {
    // Supabase の関係取得は配列 or オブジェクトで返るため正規化
    const u = Array.isArray(t.users) ? t.users[0] : t.users;
    const sub = subByUser.get(t.user_id);
    return {
      id: t.user_id,
      name: u?.name ?? '(不明)',
      day_roles: u?.day_roles ?? [],
      training_roles: u?.training_roles ?? [],
      available: sub ? sub.available : null,
      note: sub?.note ?? null,
      submitted: Boolean(sub),
    };
  });

  const assignments = (assignRows ?? []).map((a) => {
    const u = Array.isArray(a.users) ? a.users[0] : a.users;
    return { user_id: a.user_id, name: u?.name ?? '(不明)', role: a.role };
  });

  return jsonOk({
    slot,
    targets,
    role_requirements: roleReqs ?? [],
    assignments,
  });
}

// PATCH: 必要人数の更新（任意で枠情報も更新）。
async function patchHandler(req: Request, { params }: Params) {
  if (!verifyOrigin()) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const parsed = await parseBody(req, updateShiftSchema);
  if (!parsed.ok) return parsed.response;
  const { date, start_time, end_time, note, role_requirements } = parsed.data;

  const supabase = getSupabaseAdmin();
  const slotId = params.id;

  // 枠情報の更新
  const slotUpdate: Record<string, unknown> = {};
  if (date !== undefined) {
    slotUpdate.date = date;
    slotUpdate.deadline = computeDeadline(date);
  }
  if (start_time !== undefined) slotUpdate.start_time = start_time;
  if (end_time !== undefined) slotUpdate.end_time = end_time;
  if (note !== undefined) slotUpdate.note = note;
  if (Object.keys(slotUpdate).length > 0) {
    slotUpdate.updated_at = new Date().toISOString();
    const { error } = await supabase
      .from('shift_slots')
      .update(slotUpdate)
      .eq('id', slotId);
    if (error) return jsonError('更新に失敗しました', 500, 'UPDATE_FAILED');
  }

  // 必要人数の更新（slot+role の組で upsert）
  if (role_requirements && role_requirements.length > 0) {
    const rows = role_requirements.map((r) => ({
      shift_slot_id: slotId,
      role: r.role,
      required_count: r.required_count,
    }));
    const { error } = await supabase
      .from('shift_role_requirements')
      .upsert(rows, { onConflict: 'shift_slot_id,role' });
    if (error) return jsonError('更新に失敗しました', 500, 'UPDATE_FAILED');
  }

  return jsonOk({ ok: true });
}

// DELETE: シフト枠削除（関連は CASCADE）。
async function deleteHandler(_req: Request, { params }: Params) {
  if (!verifyOrigin()) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('shift_slots')
    .delete()
    .eq('id', params.id);
  if (error) return jsonError('削除に失敗しました', 500, 'DELETE_FAILED');
  return jsonOk({ ok: true });
}

export const GET = withRoute(getHandler);
export const PATCH = withRoute(patchHandler);
export const DELETE = withRoute(deleteHandler);
