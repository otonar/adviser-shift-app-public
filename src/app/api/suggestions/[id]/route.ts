import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { updateSuggestionStatusSchema } from '@/lib/validators';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

type Params = { params: Promise<{ id: string }> };

// PATCH: 対応ステータスの更新（管理者）。未対応(open)/対応済み(done)。
async function patchHandler(req: Request, { params }: Params) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const parsed = await parseBody(req, updateSuggestionStatusSchema);
  if (!parsed.ok) return parsed.response;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('suggestions')
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq('id', (await params).id)
    .select('id, status')
    .maybeSingle();
  if (error) return jsonError('更新に失敗しました', 500, 'UPDATE_FAILED');
  if (!data) return jsonError('投稿が見つかりません', 404, 'NOT_FOUND');
  return jsonOk({ suggestion: data });
}

// DELETE: 投稿の削除（管理者）。不適切な投稿のモデレーション用。
async function deleteHandler(_req: Request, { params }: Params) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('suggestions').delete().eq('id', (await params).id);
  if (error) return jsonError('削除に失敗しました', 500, 'DELETE_FAILED');
  return jsonOk({ ok: true });
}

export const PATCH = withRoute(patchHandler);
export const DELETE = withRoute(deleteHandler);
