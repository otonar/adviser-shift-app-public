import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { jsonError, jsonOk } from '@/lib/http';

// GET: メンバー一覧（管理者）。アクティブなユーザーを返す。
// 対象スタッフ選択 UI・メンバー管理（フェーズ D）で使用。
export async function GET() {
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select('id, name, day_roles, training_roles, line_user_id, is_active')
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) return jsonError('取得に失敗しました', 500, 'FETCH_FAILED');

  const users = (data ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    day_roles: u.day_roles ?? [],
    training_roles: u.training_roles ?? [],
    line_linked: Boolean(u.line_user_id),
  }));

  return jsonOk({ users });
}
