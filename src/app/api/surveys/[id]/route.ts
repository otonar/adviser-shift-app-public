import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateUser, authenticateAdmin } from '@/lib/middleware';
import { visibleScopes, type Scope } from '@/lib/scope';
import { updateSurveySchema } from '@/lib/validators';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute, isUuid, notFound } from '@/lib/http';
import type { SurveyQuestion } from '@/types';

type Params = { params: Promise<{ id: string }> };

// 同じ項目の過去の値（推移）。公開済みの回のみを対象にする
// （下書きの数字が推移に混ざると読み手が誤解するため、管理者から見ても公開分だけ）。
type HistoryPoint = {
  survey_id: string;
  date: string;
  title: string;
  number_value: number;
};

// GET: 1回分の詳細（項目ごとの値＋推移）。
//  - 管理者: 下書きも閲覧可。入力欄を出すため、値が未入力の有効項目も含めて返す。
//  - 一般ユーザー: published かつ見える scope のときだけ。値が入っている項目のみ返す。
async function getHandler(req: Request, { params }: Params) {
  const id = (await params).id;
  if (!isUuid(id)) return notFound('アンケート結果が見つかりません');

  // ?scope=mine のときは管理 Cookie があってもスタッフ視点を返す
  const viewScope = new URL(req.url).searchParams.get('scope');
  let isAdmin = false;
  if (viewScope !== 'mine') {
    const admin = await authenticateAdmin();
    isAdmin = admin.ok;
  }

  let scopes: Scope[] = [];
  if (!isAdmin) {
    const user = await authenticateUser();
    if (!user.ok) return user.response;
    scopes = await visibleScopes(user.userId);
  }

  const supabase = getSupabaseAdmin();
  const { data: survey, error: surveyError } = await supabase
    .from('surveys')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (surveyError) return jsonError('取得に失敗しました', 500, 'FETCH_FAILED');
  if (!survey) return notFound('アンケート結果が見つかりません');
  // 未公開／範囲外は「存在しない」として扱う（存在の有無も漏らさない）
  if (!isAdmin && (survey.status !== 'published' || !scopes.includes(survey.scope))) {
    return notFound('アンケート結果が見つかりません');
  }

  const [{ data: answers, error: answerError }, { data: questions, error: questionError }] =
    await Promise.all([
      supabase
        .from('survey_answers')
        .select('question_id, number_value, text_value')
        .eq('survey_id', id),
      // 項目マスタは小さいので全件取り、絞り込みはメモリ上で行う
      supabase
        .from('survey_questions')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ]);
  if (answerError || questionError) {
    return jsonError('取得に失敗しました', 500, 'FETCH_FAILED');
  }

  const answerMap = new Map(
    (answers ?? []).map((a) => [
      a.question_id as string,
      {
        number_value: a.number_value === null ? null : Number(a.number_value),
        text_value: (a.text_value as string | null) ?? null,
      },
    ])
  );

  const history = await loadHistory(supabase, isAdmin ? null : scopes);

  const items = (questions ?? [])
    .filter((q: SurveyQuestion) => {
      const answer = answerMap.get(q.id);
      const hasValue =
        !!answer && (answer.number_value !== null || !!answer.text_value);
      // 管理者は未入力の有効項目も入力欄として必要。スタッフは値のある項目だけ。
      return isAdmin ? q.is_active || hasValue : hasValue;
    })
    .map((q: SurveyQuestion) => ({
      question: {
        id: q.id,
        label: q.label,
        answer_type: q.answer_type,
        unit: q.unit,
        is_active: q.is_active,
      },
      number_value: answerMap.get(q.id)?.number_value ?? null,
      text_value: answerMap.get(q.id)?.text_value ?? null,
      history: q.answer_type === 'number' ? (history.get(q.id) ?? []) : [],
    }));

  return jsonOk({ survey, items });
}

/**
 * 項目 ID → 公開済みの回の値（実施日の古い順）の対応表を作る。
 * scopes が null なら管理者視点で scope による絞り込みをしない。
 */
async function loadHistory(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  scopes: Scope[] | null
): Promise<Map<string, HistoryPoint[]>> {
  const map = new Map<string, HistoryPoint[]>();

  let query = supabase
    .from('surveys')
    .select('id, date, title')
    .eq('status', 'published');
  if (scopes) query = query.in('scope', scopes);
  const { data: published } = await query.order('date', { ascending: true });

  const rows = published ?? [];
  if (rows.length === 0) return map;

  const { data: values } = await supabase
    .from('survey_answers')
    .select('survey_id, question_id, number_value')
    .in(
      'survey_id',
      rows.map((s) => s.id)
    )
    .not('number_value', 'is', null);

  const meta = new Map(rows.map((s) => [s.id as string, s]));
  // rows は日付の古い順なので、その順に詰めれば推移も古い順になる
  const order = new Map(rows.map((s, i) => [s.id as string, i]));
  const grouped = new Map<string, HistoryPoint[]>();
  for (const v of values ?? []) {
    const s = meta.get(v.survey_id as string);
    if (!s) continue;
    const list = grouped.get(v.question_id as string) ?? [];
    list.push({
      survey_id: s.id,
      date: s.date,
      title: s.title,
      number_value: Number(v.number_value),
    });
    grouped.set(v.question_id as string, list);
  }
  for (const [questionId, list] of grouped) {
    list.sort((a, b) => (order.get(a.survey_id) ?? 0) - (order.get(b.survey_id) ?? 0));
    map.set(questionId, list);
  }
  return map;
}

// PATCH: 内容の更新・項目ごとの値の保存・公開／下書きの切り替え（管理者）。
// 値は「渡した項目だけ」を upsert し、number も text も空なら行を削除する。
async function patchHandler(req: Request, { params }: Params) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const id = (await params).id;
  if (!isUuid(id)) return notFound('アンケート結果が見つかりません');

  const parsed = await parseBody(req, updateSurveySchema);
  if (!parsed.ok) return parsed.response;

  const supabase = getSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from('surveys')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (existingError) return jsonError('更新に失敗しました', 500, 'UPDATE_FAILED');
  if (!existing) return notFound('アンケート結果が見つかりません');

  const now = new Date().toISOString();

  // 先に値を保存する。値の保存に失敗したまま公開してしまわないように、
  // 公開フラグを含むメタ更新はこの後に行う。
  const answers = parsed.data.answers;
  if (answers && answers.length > 0) {
    const { data: questions, error: questionError } = await supabase
      .from('survey_questions')
      .select('id, answer_type');
    if (questionError) return jsonError('更新に失敗しました', 500, 'UPDATE_FAILED');
    const typeMap = new Map(
      (questions ?? []).map((q) => [q.id as string, q.answer_type as string])
    );
    if (answers.some((a) => !typeMap.has(a.question_id))) {
      return jsonError('入力内容を確認してください', 400, 'VALIDATION_ERROR');
    }

    const upserts: {
      survey_id: string;
      question_id: string;
      number_value: number | null;
      text_value: string | null;
      updated_at: string;
    }[] = [];
    const deletes: string[] = [];

    for (const a of answers) {
      const isNumber = typeMap.get(a.question_id) === 'number';
      // 項目の型に合わない値は無視する（number 項目に text が来ても取り違えない）
      const numberValue = isNumber ? (a.number_value ?? null) : null;
      const textValue = isNumber ? null : (a.text_value?.trim() || null);
      if (numberValue === null && textValue === null) {
        deletes.push(a.question_id);
        continue;
      }
      upserts.push({
        survey_id: id,
        question_id: a.question_id,
        number_value: numberValue,
        text_value: textValue,
        updated_at: now,
      });
    }

    if (upserts.length > 0) {
      const { error } = await supabase
        .from('survey_answers')
        .upsert(upserts, { onConflict: 'survey_id,question_id' });
      if (error) return jsonError('保存に失敗しました', 500, 'UPDATE_FAILED');
    }
    if (deletes.length > 0) {
      const { error } = await supabase
        .from('survey_answers')
        .delete()
        .eq('survey_id', id)
        .in('question_id', deletes);
      if (error) return jsonError('保存に失敗しました', 500, 'UPDATE_FAILED');
    }
  }

  const update: Record<string, unknown> = { updated_at: now };
  if (parsed.data.date !== undefined) update.date = parsed.data.date;
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.note !== undefined) update.note = parsed.data.note || null;
  if (parsed.data.respondent_count !== undefined) {
    update.respondent_count = parsed.data.respondent_count;
  }
  if (parsed.data.scope !== undefined) update.scope = parsed.data.scope;
  if (parsed.data.status !== undefined) {
    update.status = parsed.data.status;
    // 公開した時刻を記録し、下書きに戻したら消す
    update.published_at = parsed.data.status === 'published' ? now : null;
  }

  const { data, error } = await supabase
    .from('surveys')
    .update(update)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return jsonError('更新に失敗しました', 500, 'UPDATE_FAILED');
  if (!data) return notFound('アンケート結果が見つかりません');
  return jsonOk({ survey: data });
}

// DELETE: 1回分をまるごと削除（管理者）。項目ごとの値は ON DELETE CASCADE で消える。
async function deleteHandler(_req: Request, { params }: Params) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const id = (await params).id;
  if (!isUuid(id)) return notFound('アンケート結果が見つかりません');

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('surveys').delete().eq('id', id);
  if (error) return jsonError('削除に失敗しました', 500, 'DELETE_FAILED');
  return jsonOk({ ok: true });
}

export const GET = withRoute(getHandler);
export const PATCH = withRoute(patchHandler);
export const DELETE = withRoute(deleteHandler);
