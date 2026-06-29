import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { updateSuggestionSchema } from '@/lib/validators';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute, isUuid, notFound } from '@/lib/http';

type Params = { params: Promise<{ id: string }> };

// PATCH: ステータス更新 / 返答の保存・削除（管理者）。
// 返答（admin_reply）を保存すると status は自動で done になる。空/null は返答削除。
async function patchHandler(req: Request, { params }: Params) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const id = (await params).id;
  if (!isUuid(id)) return notFound('投稿が見つかりません');

  const parsed = await parseBody(req, updateSuggestionSchema);
  if (!parsed.ok) return parsed.response;

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };
  if (parsed.data.status !== undefined) update.status = parsed.data.status;
  if (parsed.data.admin_reply !== undefined) {
    const reply = parsed.data.admin_reply ? parsed.data.admin_reply : null;
    update.admin_reply = reply;
    update.replied_at = reply ? now : null;
    // 返答を書いたら自動で対応済みにする（削除時は status を変えない）
    if (reply) update.status = 'done';
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('suggestions')
    .update(update)
    .eq('id', id)
    .select('id, status, admin_reply, replied_at')
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

  const id = (await params).id;
  if (!isUuid(id)) return notFound('投稿が見つかりません');

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('suggestions').delete().eq('id', id);
  if (error) return jsonError('削除に失敗しました', 500, 'DELETE_FAILED');
  return jsonOk({ ok: true });
}

export const PATCH = withRoute(patchHandler);
export const DELETE = withRoute(deleteHandler);
