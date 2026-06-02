'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PasswordInput from '@/components/ui/PasswordInput';

type Mode = 'login' | 'signup';

export default function UserAuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'エラーが発生しました');
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setMode('login')}
          className={`flex-1 rounded border py-2 text-sm ${
            mode === 'login' ? 'bg-gray-900 text-white' : 'bg-white'
          }`}
        >
          ログイン
        </button>
        <button
          type="button"
          onClick={() => setMode('signup')}
          className={`flex-1 rounded border py-2 text-sm ${
            mode === 'signup' ? 'bg-gray-900 text-white' : 'bg-white'
          }`}
        >
          新規登録
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          名前
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="username"
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          パスワード
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        {mode === 'signup' && (
          <p className="text-xs text-gray-500">
            名前は2〜20文字、パスワードは8文字以上。
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-gray-900 py-2 text-white disabled:opacity-50"
        >
          {loading ? '送信中…' : mode === 'login' ? 'ログイン' : '登録'}
        </button>
      </form>
    </div>
  );
}
