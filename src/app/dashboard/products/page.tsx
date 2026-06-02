'use client';

import { useEffect, useState, useCallback } from 'react';

type Product = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  stock: number;
  out_of_stock: boolean;
};

export default function StaffProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/products?scope=mine');
      if (!res.ok) {
        setError('読み込みに失敗しました');
        return;
      }
      const data = await res.json();
      setProducts(data.products ?? []);
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">商品情報</h1>
      {loading && <p className="text-sm text-gray-500">読み込み中…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && products.length === 0 && (
        <p className="text-sm text-gray-500">商品はありません。</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {products.map((p) => (
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
          </div>
        ))}
      </div>
    </div>
  );
}
