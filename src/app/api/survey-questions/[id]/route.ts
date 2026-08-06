import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { updateSurveyQuestionSchema } from '@/lib/validators';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute, isUuid, notFound } from '@/lib/http';

type Params = { params: Promise<{ id: string }> };

// PATCH: 項目名・単位・並び順・アーカイブ状態の更新（管理者）。
// answer_type は変更できない（過去の回に入っている値の意味が変わってしまうため）。
async function patchHandler(req: Request, { params }: Params) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const id = (await params).id;
  if (!isUuid(id)) return notFound('項目が見つかりません');

  const parsed = await parseBody(req, updateSurveyQuestionSchema);
  if (!parsed.ok) return parsed.response;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.label !== undefined) update.label = parsed.data.label;
  if (parsed.data.unit !== undefined) update.unit = parsed.data.unit || null;
  if (parsed.data.sort_order !== undefined) update.sort_order = parsed.data.sort_order;
  if (parsed.data.is_active !== undefined) update.is_active = parsed.data.is_active;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('survey_questions')
    .update(update)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return jsonError('更新に失敗しました', 500, 'UPDATE_FAILED');
  if (!data) return notFound('項目が見つかりません');
  return jsonOk({ question: data });
}

// DELETE: 項目の削除（管理者）。
// すでにどこかの回で使われている項目は、消すと過去の結果が欠けるため削除させない
// （代わりにアーカイブ = is_active:false を案内する）。
async function deleteHandler(_req: Request, { params }: Params) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const id = (await params).id;
  if (!isUuid(id)) return notFound('項目が見つかりません');

  const supabase = getSupabaseAdmin();
  const { count, error: countError } = await supabase
    .from('survey_answers')
    .select('id', { count: 'exact', head: true })
    .eq('question_id', id);
  if (countError) return jsonError('削除に失敗しました', 500, 'DELETE_FAILED');
  if ((count ?? 0) > 0) {
    return jsonError(
      'この項目はすでに結果で使われています。削除ではなく「非表示にする」を使ってください',
      409,
      'QUESTION_IN_USE'
    );
  }

  const { error } = await supabase.from('survey_questions').delete().eq('id', id);
  if (error) return jsonError('削除に失敗しました', 500, 'DELETE_FAILED');
  return jsonOk({ ok: true });
}

export const PATCH = withRoute(patchHandler);
export const DELETE = withRoute(deleteHandler);
