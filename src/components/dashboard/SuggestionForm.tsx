'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  SUGGESTION_CATEGORIES,
  SUGGESTION_TYPES,
  type SuggestionCategory,
  type SuggestionType,
  type SuggestionScope,
} from '@/types';

// 目安箱の投稿フォーム。目安箱の画面でクライアント側の動きが要るのはここだけなので、
// 一覧はサーバーコンポーネントに残し、このフォームだけを切り出している。
// 投稿後は router.refresh() でサーバー側を引き直す（一覧を自前で持たない）。
export default function SuggestionForm() {
  const router = useRouter();
  const [category, setCategory] = useState<SuggestionCategory>(
    SUGGESTION_CATEGORIES[0]
  );
  const [type, setType] = useState<SuggestionType>(SUGGESTION_TYPES[0]);
  const [showName, setShowName] = useState(false);
  const [scope, setScope] = useState<SuggestionScope>('all');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  async function submit() {
    setSaving(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          type,
          show_name: showName,
          scope,
          content,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '投稿に失敗しました');
        return;
      }
      setContent('');
      setDone(true);
      startRefresh(() => router.refresh());
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded border bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">種類（内容の分野）</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SuggestionCategory)}
            className="rounded border px-3 py-2"
          >
            {SUGGESTION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">区分</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as SuggestionType)}
            className="rounded border px-3 py-2"
          >
            {SUGGESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <fieldset>
          <legend className="text-sm text-gray-600">名前</legend>
          <div className="mt-1 flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="show_name"
                checked={!showName}
                onChange={() => setShowName(false)}
              />
              非表示
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="show_name"
                checked={showName}
                onChange={() => setShowName(true)}
              />
              表示
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm text-gray-600">公開範囲</legend>
          <div className="mt-1 flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scope"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
              />
              全体
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scope"
                checked={scope === 'core'}
                onChange={() => setScope('core')}
              />
              コアだけ
            </label>
          </div>
        </fieldset>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="内容を入力してください"
        rows={4}
        maxLength={2000}
        className="mt-3 w-full rounded border px-3 py-2 text-sm"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={saving || refreshing || !content.trim()}
          onClick={submit}
          className="rounded border bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? '送信中…' : '投稿する'}
        </button>
        {done && <span className="text-sm text-green-700">送信しました ✓</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </section>
  );
}
