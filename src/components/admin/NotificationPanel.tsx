'use client';

import { useEffect, useState, useCallback } from 'react';

type Member = {
  id: string;
  name: string;
  line_linked: boolean;
};

type Log = {
  id: string;
  notification_type: string;
  message: string;
  status: string;
  sent_at: string;
};

export default function NotificationPanel() {
  const [members, setMembers] = useState<Member[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [lineConfigured, setLineConfigured] = useState(true);
  const [message, setMessage] = useState('');
  const [targetMode, setTargetMode] = useState<'all' | 'select'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setMembers(data.users ?? []);
      }
    } catch {
      /* noop */
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
        setLineConfigured(data.line_configured ?? false);
      }
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    loadMembers();
    loadLogs();
  }, [loadMembers, loadLogs]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function send() {
    setSending(true);
    setResult(null);
    setError(null);
    try {
      const target_user_ids =
        targetMode === 'all' ? 'all' : Array.from(selected);
      if (targetMode === 'select' && selected.size === 0) {
        setError('宛先を選択してください');
        return;
      }
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'custom', target_user_ids, message }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '送信に失敗しました');
        return;
      }
      const data = await res.json();
      setResult(`送信 ${data.sent} 件 / スキップ ${data.skipped} 件`);
      setMessage('');
      loadLogs();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {!lineConfigured && (
        <p className="rounded border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
          LINE が未設定です。送信内容はログに記録されますが、実際の配信は行われません。
        </p>
      )}

      <section className="rounded border bg-white p-4">
        <h2 className="mb-3 font-bold">通知を送信</h2>

        <div className="mb-3 flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={targetMode === 'all'}
              onChange={() => setTargetMode('all')}
            />
            全員
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={targetMode === 'select'}
              onChange={() => setTargetMode('select')}
            />
            個別に選択
          </label>
        </div>

        {targetMode === 'select' && (
          <div className="mb-3 max-h-48 overflow-y-auto rounded border">
            {members.length === 0 && (
              <p className="p-2 text-xs text-gray-500">メンバーがいません</p>
            )}
            {members.map((m) => (
              <label
                key={m.id}
                className="flex items-center gap-2 border-b px-2 py-1.5 text-sm last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selected.has(m.id)}
                  onChange={() => toggle(m.id)}
                />
                <span>{m.name}</span>
                {!m.line_linked && (
                  <span className="text-xs text-gray-400">（LINE未連携）</span>
                )}
              </label>
            ))}
          </div>
        )}

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="送信するメッセージ"
          rows={4}
          className="w-full rounded border px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={sending || !message.trim()}
          onClick={send}
          className="mt-3 rounded border bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {sending ? '送信中…' : '送信'}
        </button>
        {result && <p className="mt-2 text-sm text-green-600">{result}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>

      <section className="rounded border bg-white p-4">
        <h2 className="mb-3 font-bold">送信ログ（直近100件）</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-gray-500">ログはありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-gray-500">
                <tr>
                  <th className="px-2 py-1">日時</th>
                  <th className="px-2 py-1">種別</th>
                  <th className="px-2 py-1">メッセージ</th>
                  <th className="px-2 py-1">状態</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b last:border-b-0 align-top">
                    <td className="whitespace-nowrap px-2 py-1 text-xs text-gray-500">
                      {new Date(l.sent_at).toLocaleString('ja-JP', {
                        timeZone: 'Asia/Tokyo',
                      })}
                    </td>
                    <td className="px-2 py-1 text-xs">{l.notification_type}</td>
                    <td className="px-2 py-1">{l.message}</td>
                    <td className="px-2 py-1">
                      <span
                        className={
                          l.status === 'sent'
                            ? 'text-green-700'
                            : l.status === 'failed'
                              ? 'text-red-700'
                              : 'text-gray-500'
                        }
                      >
                        {l.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
