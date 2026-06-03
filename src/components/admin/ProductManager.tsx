'use client';

import { useEffect, useState, useCallback } from 'react';

type Product = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  stock: number;
  is_visible: boolean;
};

const empty = {
  name: '',
  description: '',
  category: '',
  stock: 0,
  is_visible: true,
};

export default function ProductManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/products');
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
    void (async () => {
      await load();
    })();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <CreateForm onCreated={load} />
      {loading && <p className="text-sm text-gray-500">読み込み中…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && products.length === 0 && (
        <p className="text-sm text-gray-500">商品はまだありません。</p>
      )}
      {products.length > 0 && (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2">商品名</th>
                <th className="px-3 py-2">カテゴリ</th>
                <th className="px-3 py-2">在庫</th>
                <th className="px-3 py-2">表示</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <ProductRow key={p.id} product={p} onChanged={load} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          category: form.category || null,
          stock: Number(form.stock) || 0,
          is_visible: form.is_visible,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '追加に失敗しました');
        return;
      }
      setForm(empty);
      onCreated();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded border bg-white p-4">
      <h2 className="mb-3 font-bold">商品を追加</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="商品名 *"
          className="rounded border px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          placeholder="カテゴリ"
          className="rounded border px-3 py-2 text-sm"
        />
        <input
          type="number"
          min={0}
          value={form.stock}
          onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
          placeholder="在庫"
          className="rounded border px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_visible}
            onChange={(e) => setForm({ ...form, is_visible: e.target.checked })}
          />
          スタッフに表示する
        </label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="説明（任意）"
          className="rounded border px-3 py-2 text-sm sm:col-span-2"
          rows={2}
        />
      </div>
      <button
        type="button"
        disabled={saving || !form.name.trim()}
        onClick={submit}
        className="mt-3 rounded border bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        追加
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}

function ProductRow({
  product,
  onChanged,
}: {
  product: Product;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(product);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          category: form.category || null,
          stock: Number(form.stock) || 0,
          is_visible: form.is_visible,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '更新に失敗しました');
        return;
      }
      setEditing(false);
      onChanged();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`「${product.name}」を削除しますか？`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '削除に失敗しました');
        return;
      }
      onChanged();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <tr className="border-b align-top last:border-b-0">
        <td className="px-3 py-2">
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded border px-2 py-1 text-sm"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="text"
            value={form.category ?? ''}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full rounded border px-2 py-1 text-sm"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            min={0}
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
            className="w-20 rounded border px-2 py-1 text-sm"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="checkbox"
            checked={form.is_visible}
            onChange={(e) => setForm({ ...form, is_visible: e.target.checked })}
          />
        </td>
        <td className="px-3 py-2">
          <div className="flex gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded border bg-gray-900 px-2 py-1 text-xs text-white disabled:opacity-50"
            >
              保存
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setForm(product);
                setEditing(false);
              }}
              className="rounded border px-2 py-1 text-xs"
            >
              取消
            </button>
          </div>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b align-top last:border-b-0">
      <td className="px-3 py-2">
        <span className="font-medium">{product.name}</span>
        {product.description && (
          <p className="text-xs text-gray-400">{product.description}</p>
        )}
      </td>
      <td className="px-3 py-2 text-gray-600">{product.category ?? '—'}</td>
      <td className="px-3 py-2">
        {product.stock <= 0 ? (
          <span className="text-red-700">0（在庫なし）</span>
        ) : (
          product.stock
        )}
      </td>
      <td className="px-3 py-2">{product.is_visible ? '表示' : '非表示'}</td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded border px-2 py-1 text-xs"
          >
            編集
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
          >
            削除
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}
