import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { adminUpdateUserSchema } from '@/lib/validators';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

type Params = { params: { id: string } };

// PATCH: メンバーのアクティブ状態を変更（管理者）。強制脱退 / 復帰。
async function patchHandler(req: Request, { params }: Params) {
  if (!verifyOrigin()) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const parsed = await parseBody(req, adminUpdateUserSchema);
  if (!parsed.ok) return parsed.response;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .update({ is_active: parsed.data.is_active, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, is_active')
    .maybeSingle();
  if (error) return jsonError('更新に失敗しました', 500, 'UPDATE_FAILED');
  if (!data) return jsonError('ユーザーが見つかりません', 404, 'NOT_FOUND');

  return jsonOk({ user: data });
}

export const PATCH = withRoute(patchHandler);
