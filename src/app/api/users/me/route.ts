import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateUser } from '@/lib/middleware';
import { clearUserCookie } from '@/lib/auth';
import { updateMeSchema } from '@/lib/validators';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

// GET: 自分の設定情報。
async function getHandler() {
  const auth = await authenticateUser();
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select('id, name, day_roles, training_roles, line_user_id')
    .eq('id', auth.userId)
    .maybeSingle();
  if (error) return jsonError('取得に失敗しました', 500, 'FETCH_FAILED');
  if (!data) return jsonError('ユーザーが見つかりません', 404, 'NOT_FOUND');

  return jsonOk({
    user: {
      id: data.id,
      name: data.name,
      day_roles: data.day_roles ?? [],
      training_roles: data.training_roles ?? [],
      line_linked: Boolean(data.line_user_id),
    },
  });
}

// PATCH: 名前変更・LINE連携/解除。役割は本人では変更できない（管理者のみ）。
async function patchHandler(req: Request) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const auth = await authenticateUser();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, updateMeSchema);
  if (!parsed.ok) return parsed.response;
  const { name, line_user_id } = parsed.data;

  const supabase = getSupabaseAdmin();

  // 名前の重複チェック（自分以外）
  if (name !== undefined) {
    const { data: dup } = await supabase
      .from('users')
      .select('id')
      .eq('name', name)
      .neq('id', auth.userId)
      .maybeSingle();
    if (dup) return jsonError('その名前は既に使われています', 409, 'NAME_TAKEN');
  }

  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (line_user_id !== undefined) update.line_user_id = line_user_id;
  update.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('users')
    .update(update)
    .eq('id', auth.userId);
  if (error) return jsonError('更新に失敗しました', 500, 'UPDATE_FAILED');

  return jsonOk({ ok: true });
}

// DELETE: 脱退（is_active=false）＋ Cookie 削除でログアウト。
async function deleteHandler() {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const auth = await authenticateUser();
  if (!auth.ok) return auth.response;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('users')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', auth.userId);
  if (error) return jsonError('処理に失敗しました', 500, 'UPDATE_FAILED');

  await clearUserCookie();
  return jsonOk({ ok: true });
}

export const GET = withRoute(getHandler);
export const PATCH = withRoute(patchHandler);
export const DELETE = withRoute(deleteHandler);
