'use client';

import { useEffect, useState } from 'react';
import { formatStockFreshness } from '@/lib/datetime';

type Product = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  stock: number;
  out_of_stock: boolean;
  stock_updated_at: string | null;
};

export default function StaffProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/products?scope=mine');
        if (!res.ok) {
          if (!cancelled) setError('読み込みに失敗しました');
          return;
        }
        const data = await res.json();
        if (!cancelled) setProducts(data.products ?? []);
      } catch {
        if (!cancelled) setError('通信エラーが発生しました');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">商品情報</h1>
      {loading && <p className="text-sm text-gray-500">読み込み中…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && products.length === 0 && (
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
