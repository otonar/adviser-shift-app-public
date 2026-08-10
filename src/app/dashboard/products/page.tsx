import { redirect } from 'next/navigation';
import { authenticateUser } from '@/lib/middleware';
import { fetchVisibleProducts, type VisibleProduct } from '@/lib/staff-queries';
import { formatStockFreshness } from '@/lib/datetime';

// 商品情報。押して動く要素が無いのでサーバーだけで組み立てる
// （表示してから /api/products を取りに行く形をやめ、往復を1回分減らした）。
export default async function StaffProductsPage() {
  const auth = await authenticateUser();
  if (!auth.ok) redirect('/');

  let products: VisibleProduct[] = [];
  let failed = false;
  try {
    products = await fetchVisibleProducts();
  } catch {
    failed = true;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">商品情報</h1>
      {failed && <p className="text-sm text-red-600">読み込みに失敗しました</p>}
      {!failed && products.length === 0 && (
        <p className="text-sm text-gray-500">商品はありません。</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {products.map((p) => {
          const freshness = formatStockFreshness(p.stock_updated_at);
          return (
            <div key={p.id} className="rounded border bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold">{p.name}</p>
                {p.out_of_stock ? (
                  <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
                    在庫なし
                  </span>
                ) : (
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    在庫 {p.stock}
                  </span>
                )}
              </div>
              {p.category && (
                <p className="mt-1 text-xs text-gray-400">{p.category}</p>
              )}
              {p.description && (
                <p className="mt-2 text-sm text-gray-600">{p.description}</p>
              )}
              <p
                className={`mt-2 text-xs ${
                  freshness.stale ? 'font-medium text-amber-700' : 'text-gray-400'
                }`}
              >
                在庫更新: {freshness.text}
                {freshness.stale && ' ⚠️ 古い情報の可能性'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
