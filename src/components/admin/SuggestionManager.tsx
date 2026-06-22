'use client';

import { useEffect, useState, useCallback } from 'react';

type Suggestion = {
  id: string;
  category: string;
  type: string;
  show_name: boolean;
  scope: 'all' | 'core';
  content: string;
  status: 'open' | 'done';
  admin_reply: string | null;
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

export default function SuggestionManager() {
  const [list, setList] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/suggestions');
      if (!res.ok) {
        setError('読み込みに失敗しました');
        return;
      }
      const data = await res.json();
      setList(data.suggestions ?? []);
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

  const visible = list.filter((s) => filter === 'all' || s.status === filter);
  const openCount = list.filter((s) => s.status === 'open').length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-500">未対応 {openCount} 件</span>
        <div className="ml-auto flex gap-1">
          {(['all', 'open', 'done'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded border px-3 py-1 text-xs ${
                filter === f ? 'bg-gray-900 text-white' : 'text-gray-600'
              }`}
            >
              {f === 'all' ? 'すべて' : f === 'open' ? '未対応' : '対応済み'}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">読み込み中…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && visible.length === 0 && (
        <p className="text-sm text-gray-500">該当する投稿はありません。</p>
      )}

      {visible.map((s) => (
        <SuggestionCard key={s.id} suggestion={s} onChanged={load} />
      ))}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onChanged,
}: {
  suggestion: Suggestion;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(status: 'open' | 'done') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/suggestions/${suggestion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '更新に失敗しました');
        return;
      }
      onChanged();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('この投稿を削除しますか？')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/suggestions/${suggestion.id}`, {
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

  const done = suggestion.status === 'done';

  return (
    <article className="rounded border bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">
          {suggestion.category}
        </span>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">
          {suggestion.type}
        </span>
        <span
          className={`rounded px-2 py-0.5 ${
            suggestion.scope === 'core'
              ? 'bg-purple-100 text-purple-700'
              : 'bg-blue-100 text-blue-700'
          }`}
        >
          {suggestion.scope === 'core' ? 'コア限定' : '全体'}
        </span>
        {!suggestion.show_name && (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">
            名前非表示
          </span>
        )}
        <span
          className={`rounded px-2 py-0.5 font-bold ${
            done ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {done ? '対応済み' : '未対応'}
        </span>
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
        {suggestion.content}
      </p>
      <p className="mt-2 text-xs text-gray-400">
        {suggestion.show_name
          ? (suggestion.author_name ?? '（不明）')
          : '（名前非表示）'}{' '}
        ・ {formatDateJst(suggestion.created_at)}
      </p>

      <ReplyEditor suggestion={suggestion} onChanged={onChanged} />

      <div className="mt-3 flex items-center gap-2">
        {done ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setStatus('open')}
            className="rounded border px-3 py-1 text-xs disabled:opacity-50"
          >
            未対応に戻す
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setStatus('done')}
            className="rounded border bg-gray-900 px-3 py-1 text-xs text-white disabled:opacity-50"
          >
            対応済みにする
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={remove}
          className="rounded border border-red-300 px-3 py-1 text-xs text-red-700 disabled:opacity-50"
        >
          削除
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </article>
  );
}

// 管理者からの返答（1件・編集可）。保存するとサーバー側で status が done になる。
function ReplyEditor({
  suggestion,
  onChanged,
}: {
  suggestion: Suggestion;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(suggestion.admin_reply ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(reply: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/suggestions/${suggestion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_reply: reply }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '保存に失敗しました');
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

  if (!editing) {
    return (
      <div className="mt-3 rounded bg-blue-50 p-3">
        {suggestion.admin_reply ? (
          <>
            <p className="text-xs font-bold text-blue-800">運営からの返答</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
              {suggestion.admin_reply}
            </p>
            <button
              type="button"
              onClick={() => {
                setText(suggestion.admin_reply ?? '');
                setEditing(true);
              }}
              className="mt-2 rounded border px-3 py-1 text-xs"
            >
              返答を編集
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setText('');
              setEditing(true);
            }}
            className="rounded border px-3 py-1 text-xs"
          >
            返答する
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded bg-blue-50 p-3">
      <p className="text-xs font-bold text-blue-800">返答（保存すると対応済みになります）</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="返答を入力してください"
        className="mt-1 w-full rounded border px-3 py-2 text-sm"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => send(text)}
          className="rounded border bg-gray-900 px-3 py-1 text-xs text-white disabled:opacity-50"
        >
          {busy ? '保存中…' : '保存'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setEditing(false)}
          className="rounded border px-3 py-1 text-xs disabled:opacity-50"
        >
          取消
        </button>
        {suggestion.admin_reply && (
          <button
            type="button"
            disabled={busy}
            onClick={() => send(null)}
            className="rounded border border-red-300 px-3 py-1 text-xs text-red-700 disabled:opacity-50"
          >
            返答を削除
          </button>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
