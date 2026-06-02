import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { jsonError, jsonOk, withRoute } from '@/lib/http';

// GET: メンバー一覧（管理者）。
//  - 既定: アクティブなユーザーのみ（対象スタッフ選択 UI 用）。
//  - ?scope=all: 脱退済みを含む全ユーザー（メンバー管理画面用）。
async function getHandler(req: Request) {
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const scope = new URL(req.url).searchParams.get('scope');
  const includeInactive = scope === 'all';

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('users')
    .select('id, name, day_roles, training_roles, line_user_id, is_active')
    .order('name', { ascending: true });
  if (!includeInactive) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) return jsonError('取得に失敗しました', 500, 'FETCH_FAILED');

  const users = (data ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    day_roles: u.day_roles ?? [],
    training_roles: u.training_roles ?? [],
    line_linked: Boolean(u.line_user_id),
    is_active: u.is_active,
  }));

  return jsonOk({ users });
}

export const GET = withRoute(getHandler);
