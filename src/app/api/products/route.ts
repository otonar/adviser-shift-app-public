import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateUser, authenticateAdmin } from '@/lib/middleware';
import { createProductSchema } from '@/lib/validators';
import { fetchVisibleProducts } from '@/lib/staff-queries';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

// GET: 商品一覧。
//  - 管理者: 全商品（非表示含む）を返す。
//  - 一般ユーザー: is_visible=true のみ。stock=0 にフラグ付与。
async function getHandler(req: Request) {
  // ?scope=mine のときは管理 Cookie があってもスタッフ視点（可視商品のみ）を返す
  const scope = new URL(req.url).searchParams.get('scope');
  if (scope !== 'mine') {
    const admin = await authenticateAdmin();
    if (admin.ok) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) return jsonError('取得に失敗しました', 500, 'FETCH_FAILED');
      return jsonOk({ products: data ?? [] });
    }
  }

  const user = await authenticateUser();
  if (!user.ok) return user.response;

  // 画面（/dashboard/products）と同じクエリを使う
  try {
    return jsonOk({ products: await fetchVisibleProducts() });
  } catch {
    return jsonError('取得に失敗しました', 500, 'FETCH_FAILED');
  }
}

// POST: 商品追加（管理者）。
async function postHandler(req: Request) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const parsed = await parseBody(req, createProductSchema);
  if (!parsed.ok) return parsed.response;
  const { name, description, category, stock, is_visible } = parsed.data;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('products')
    .insert({
      name,
      description: description ?? null,
      category: category ?? null,
      stock,
      is_visible,
    })
    .select('*')
    .single();
  if (error || !data) {
    return jsonError('商品の作成に失敗しました', 500, 'CREATE_FAILED');
  }
  return jsonOk({ product: data }, 201);
}

export const GET = withRoute(getHandler);
export const POST = withRoute(postHandler);
