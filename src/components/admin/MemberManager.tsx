'use client';

import { useEffect, useState, useCallback } from 'react';

type Member = {
  id: string;
  name: string;
  day_roles: string[];
  training_roles: string[];
  line_linked: boolean;
  is_active: boolean;
};

export default function MemberManager() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/users?scope=all');
      if (!res.ok) {
        setError('読み込みに失敗しました');
        return;
      }
      const data = await res.json();
      setMembers(data.users ?? []);
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

  async function setActive(member: Member, isActive: boolean) {
    if (
      !isActive &&
      !window.confirm(`「${member.name}」を強制脱退させますか？`)
    ) {
      return;
    }
    setBusyId(member.id);
    setError(null);
    try {
      const res = await fetch(`/api/users/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: isActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '更新に失敗しました');
        return;
      }
      load();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {loading && <p className="text-sm text-gray-500">読み込み中…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && members.length === 0 && (
        <p className="text-sm text-gray-500">メンバーはいません。</p>
      )}
      {members.length > 0 && (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2">名前</th>
                <th className="px-3 py-2">当日用役割</th>
                <th className="px-3 py-2">研修用役割</th>
                <th className="px-3 py-2">LINE</th>
                <th className="px-3 py-2">状態</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr
                  key={m.id}
                  className={`border-b last:border-b-0 ${
                    m.is_active ? '' : 'bg-gray-50 text-gray-400'
                  }`}
                >
                  <td className="px-3 py-2 font-medium">{m.name}</td>
                  <td className="px-3 py-2">{m.day_roles.join('・') || '—'}</td>
                  <td className="px-3 py-2">
                    {m.training_roles.join('・') || '—'}
                  </td>
                  <td className="px-3 py-2">{m.line_linked ? '連携済み' : '未連携'}</td>
                  <td className="px-3 py-2">
                    {m.is_active ? (
                      <span className="text-green-700">在籍</span>
                    ) : (
                      <span className="text-gray-500">脱退済み</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {m.is_active ? (
                      <button
                        type="button"
                        disabled={busyId === m.id}
                        onClick={() => setActive(m, false)}
                        className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
                      >
                        強制脱退
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === m.id}
                        onClick={() => setActive(m, true)}
                        className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                      >
                        復帰
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
