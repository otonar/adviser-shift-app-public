import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { adminUpdateUserSchema } from '@/lib/validators';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

type Params = { params: Promise<{ id: string }> };

// PATCH: メンバーの状態・役割を変更（管理者）。強制脱退/復帰、当日用・研修用役割の設定。
async function patchHandler(req: Request, { params }: Params) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const parsed = await parseBody(req, adminUpdateUserSchema);
  if (!parsed.ok) return parsed.response;

  const update: Record<string, unknown> = {};
  if (parsed.data.is_active !== undefined) update.is_active = parsed.data.is_active;
  if (parsed.data.day_roles !== undefined) update.day_roles = parsed.data.day_roles;
  if (parsed.data.training_roles !== undefined) {
    update.training_roles = parsed.data.training_roles;
  }
  update.updated_at = new Date().toISOString();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .update(update)
    .eq('id', (await params).id)
    .select('id, is_active, day_roles, training_roles')
    .maybeSingle();
  if (error) return jsonError('更新に失敗しました', 500, 'UPDATE_FAILED');
  if (!data) return jsonError('ユーザーが見つかりません', 404, 'NOT_FOUND');

  return jsonOk({ user: data });
}

export const PATCH = withRoute(patchHandler);
