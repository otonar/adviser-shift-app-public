import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { updateProductSchema } from '@/lib/validators';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute, isUuid, notFound } from '@/lib/http';

type Params = { params: Promise<{ id: string }> };

// PATCH: 商品更新（管理者）。
async function patchHandler(req: Request, { params }: Params) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const id = (await params).id;
  if (!isUuid(id)) return notFound('商品が見つかりません');

  const parsed = await parseBody(req, updateProductSchema);
  if (!parsed.ok) return parsed.response;

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { ...parsed.data };
  update.updated_at = now;
  // 在庫数が送られたときだけ在庫鮮度を更新する（名前等の編集では更新しない）。
  if (parsed.data.stock !== undefined) {
    update.stock_updated_at = now;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('products')
    .update(update)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return jsonError('更新に失敗しました', 500, 'UPDATE_FAILED');
  if (!data) return jsonError('商品が見つかりません', 404, 'NOT_FOUND');
  return jsonOk({ product: data });
}

// DELETE: 商品削除（管理者）。
async function deleteHandler(_req: Request, { params }: Params) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const id = (await params).id;
  if (!isUuid(id)) return notFound('商品が見つかりません');

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) return jsonError('削除に失敗しました', 500, 'DELETE_FAILED');
  return jsonOk({ ok: true });
}

export const PATCH = withRoute(patchHandler);
export const DELETE = withRoute(deleteHandler);
