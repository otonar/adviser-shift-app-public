import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { createSurveyQuestionSchema } from '@/lib/validators';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

// アンケートの質問項目マスタ。管理者専用（スタッフ側は結果の詳細 API がラベルを同梱するため不要）。

// GET: 項目一覧（アーカイブ含む全件）。表示順→作成順。
async function getHandler() {
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('survey_questions')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return jsonError('取得に失敗しました', 500, 'FETCH_FAILED');
  return jsonOk({ questions: data ?? [] });
}

// POST: 項目を追加（管理者）。sort_order 未指定なら末尾に置く。
async function postHandler(req: Request) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const parsed = await parseBody(req, createSurveyQuestionSchema);
  if (!parsed.ok) return parsed.response;
  const { label, answer_type, unit, sort_order } = parsed.data;

  const supabase = getSupabaseAdmin();

  let order = sort_order;
  if (order === undefined) {
    const { data: last } = await supabase
      .from('survey_questions')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    order = (last?.sort_order ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from('survey_questions')
    .insert({
      label,
      answer_type,
      // 単位は 'number' のときだけ意味を持つ
      unit: answer_type === 'number' ? (unit ?? null) : null,
      sort_order: order,
    })
    .select('*')
    .single();
  if (error || !data) return jsonError('項目の追加に失敗しました', 500, 'CREATE_FAILED');
  return jsonOk({ question: data }, 201);
}

export const GET = withRoute(getHandler);
export const POST = withRoute(postHandler);
