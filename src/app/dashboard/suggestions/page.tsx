'use client';

import { useEffect, useState } from 'react';
import {
  SUGGESTION_CATEGORIES,
  SUGGESTION_TYPES,
  type SuggestionCategory,
  type SuggestionType,
  type SuggestionScope,
} from '@/types';

type PublicSuggestion = {
  id: string;
  category: string;
  type: string;
  scope: SuggestionScope;
  content: string;
  status: 'open' | 'done';
  created_at: string;
  author_name: string | null;
};

function formatDateJst(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export default function StaffSuggestionsPage() {
  const [list, setList] = useState<PublicSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/suggestions?scope=mine');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setList(data.suggestions ?? []);
      } catch {
        // 一覧の取得失敗は致命的でないため握りつぶす（投稿は別フォーム）
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">目安箱</h1>
        <p className="mt-1 text-sm text-gray-500">
          運営への質問・意見・相談を投稿できます。
        </p>
      </div>
      <SuggestionForm onPosted={() => setReloadKey((k) => k + 1)} />

      <section className="flex flex-col gap-3">
        <h2 className="font-bold">みんなの投稿</h2>
        {loading && <p className="text-sm text-gray-500">読み込み中…</p>}
        {!loading && list.length === 0 && (
          <p className="text-sm text-gray-500">表示できる投稿はまだありません。</p>
        )}
        {list.map((s) => (
          <article key={s.id} className="rounded border bg-white p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                {s.category}
              </span>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                {s.type}
              </span>
              {s.scope === 'core' && (
                <span className="rounded bg-purple-100 px-2 py-0.5 text-purple-700">
                  コア限定
                </span>
              )}
              {s.status === 'done' && (
                <span className="rounded bg-green-100 px-2 py-0.5 font-bold text-green-800">
                  対応済み
                </span>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
              {s.content}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              {s.author_name ?? '（名前非表示）'} ・ {formatDateJst(s.created_at)}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}

function SuggestionForm({ onPosted }: { onPosted: () => void }) {
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
      onPosted();
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
          disabled={saving || !content.trim()}
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
