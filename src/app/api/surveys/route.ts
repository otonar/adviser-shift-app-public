import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateUser, authenticateAdmin } from '@/lib/middleware';
import { visibleScopes } from '@/lib/scope';
import { createSurveySchema } from '@/lib/validators';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

const LIST_COLUMNS =
  'id, date, title, note, respondent_count, status, scope, published_at, created_at';

// GET: アンケート結果の一覧（実施日の新しい順）。
//  - 管理者: 下書き含む全件。
//  - 一般ユーザー: published かつ自分に見える scope のみ。
async function getHandler(req: Request) {
  // ?scope=mine のときは管理 Cookie があってもスタッフ視点を返す
  const scope = new URL(req.url).searchParams.get('scope');
  if (scope !== 'mine') {
    const admin = await authenticateAdmin();
    if (admin.ok) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('surveys')
        .select(LIST_COLUMNS)
        .order('date', { ascending: false });
      if (error) return jsonError('取得に失敗しました', 500, 'FETCH_FAILED');
      return jsonOk({ surveys: data ?? [] });
    }
  }

  const user = await authenticateUser();
  if (!user.ok) return user.response;

  const supabase = getSupabaseAdmin();
  const scopes = await visibleScopes(user.userId);
  const { data, error } = await supabase
    .from('surveys')
    .select(LIST_COLUMNS)
    .eq('status', 'published')
    .in('scope', scopes)
    .order('date', { ascending: false });
  if (error) return jsonError('取得に失敗しました', 500, 'FETCH_FAILED');
  return jsonOk({ surveys: data ?? [] });
}

// POST: アンケート結果を新規作成（管理者）。作成時は必ず下書き。
// 項目ごとの値は作成後に PATCH で入れる。
async function postHandler(req: Request) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const parsed = await parseBody(req, createSurveySchema);
  if (!parsed.ok) return parsed.response;
  const { date, title, note, respondent_count, scope } = parsed.data;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('surveys')
    .insert({
      date,
      title,
      note: note || null,
      respondent_count: respondent_count ?? null,
      scope,
      status: 'draft',
    })
    .select(LIST_COLUMNS)
    .single();
  if (error || !data) return jsonError('作成に失敗しました', 500, 'CREATE_FAILED');
  return jsonOk({ survey: data }, 201);
}

export const GET = withRoute(getHandler);
export const POST = withRoute(postHandler);
