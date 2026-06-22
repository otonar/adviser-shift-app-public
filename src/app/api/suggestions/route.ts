import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateUser, authenticateAdmin } from '@/lib/middleware';
import { createSuggestionSchema } from '@/lib/validators';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';
import { CORE_ROLE } from '@/types';

// 指定 user_id 群の表示名を一括取得して Map で返す（埋め込み join の関係型の曖昧さを避ける）。
async function fetchAuthorNames(
  userIds: (string | null)[]
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from('users').select('id, name').in('id', ids);
  for (const u of data ?? []) map.set(u.id, u.name);
  return map;
}

// GET: 目安箱の投稿一覧。
//  - 管理者: 全件（scope 問わず）。名前は show_name=true のものだけ返す。
//  - 一般ユーザー: 全体公開 + 自分がコアメンバーならコア限定も。名前も show_name に従う。
async function getHandler(req: Request) {
  // ?scope=mine のときは管理 Cookie があってもスタッフ視点を返す
  const scope = new URL(req.url).searchParams.get('scope');
  if (scope !== 'mine') {
    const admin = await authenticateAdmin();
    if (admin.ok) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('suggestions')
        .select('id, category, type, show_name, scope, content, status, admin_reply, replied_at, created_at, user_id')
        .order('created_at', { ascending: false });
      if (error) return jsonError('取得に失敗しました', 500, 'FETCH_FAILED');
      const rows = data ?? [];
      // 名前は show_name=true のぶんだけ引く（非表示は名前を出さない）
      const names = await fetchAuthorNames(
        rows.filter((r) => r.show_name).map((r) => r.user_id)
      );
      const suggestions = rows.map((r) => ({
        id: r.id,
        category: r.category,
        type: r.type,
        show_name: r.show_name,
        scope: r.scope,
        content: r.content,
        status: r.status,
        admin_reply: r.admin_reply,
        replied_at: r.replied_at,
        created_at: r.created_at,
        author_name: r.show_name ? (names.get(r.user_id) ?? null) : null,
      }));
      return jsonOk({ suggestions });
    }
  }

  const user = await authenticateUser();
  if (!user.ok) return user.response;

  const supabase = getSupabaseAdmin();
  // コアメンバーなら 'core' 限定の投稿も閲覧できる
  const { data: me } = await supabase
    .from('users')
    .select('training_roles')
    .eq('id', user.userId)
    .single();
  const isCore =
    Array.isArray(me?.training_roles) && me.training_roles.includes(CORE_ROLE);
  const scopes = isCore ? ['all', 'core'] : ['all'];

  const { data, error } = await supabase
    .from('suggestions')
    .select('id, category, type, show_name, scope, content, status, admin_reply, replied_at, created_at, user_id')
    .in('scope', scopes)
    .order('created_at', { ascending: false });
  if (error) return jsonError('取得に失敗しました', 500, 'FETCH_FAILED');
  const rows = data ?? [];
  const names = await fetchAuthorNames(
    rows.filter((r) => r.show_name).map((r) => r.user_id)
  );
  const suggestions = rows.map((r) => ({
    id: r.id,
    category: r.category,
    type: r.type,
    show_name: r.show_name,
    scope: r.scope,
    content: r.content,
    status: r.status,
    admin_reply: r.admin_reply,
    replied_at: r.replied_at,
    created_at: r.created_at,
    author_name: r.show_name ? (names.get(r.user_id) ?? null) : null,
  }));
  return jsonOk({ suggestions });
}

// POST: 目安箱へ投稿（スタッフ）。名前非表示でも user_id は保存する。
async function postHandler(req: Request) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const user = await authenticateUser();
  if (!user.ok) return user.response;

  const parsed = await parseBody(req, createSuggestionSchema);
  if (!parsed.ok) return parsed.response;
  const { category, type, show_name, scope, content } = parsed.data;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('suggestions').insert({
    user_id: user.userId,
    category,
    type,
    show_name,
    scope,
    content,
  });
  if (error) return jsonError('投稿に失敗しました', 500, 'CREATE_FAILED');
  return jsonOk({ ok: true }, 201);
}

export const GET = withRoute(getHandler);
export const POST = withRoute(postHandler);
