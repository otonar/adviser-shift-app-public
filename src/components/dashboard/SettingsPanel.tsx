'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DAY_ROLES, TRAINING_ROLES } from '@/types';

type Me = {
  id: string;
  name: string;
  day_roles: string[];
  training_roles: string[];
  line_linked: boolean;
};

// LIFF SDK を CDN から動的ロード（未インストール依存を避ける）。
type LiffModule = {
  init: (config: { liffId: string }) => Promise<void>;
  isLoggedIn: () => boolean;
  login: () => void;
  getProfile: () => Promise<{ userId: string }>;
};
declare global {
  interface Window {
    liff?: LiffModule;
  }
}

function loadLiffScript(): Promise<LiffModule> {
  return new Promise((resolve, reject) => {
    if (window.liff) return resolve(window.liff);
    const script = document.createElement('script');
    script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    script.onload = () => {
      if (window.liff) resolve(window.liff);
      else reject(new Error('LIFF SDK の読み込みに失敗しました'));
    };
    script.onerror = () => reject(new Error('LIFF SDK の読み込みに失敗しました'));
    document.head.appendChild(script);
  });
}

export default function SettingsPanel({ liffId }: { liffId: string | null }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/users/me');
      if (!res.ok) {
        setLoadError('読み込みに失敗しました');
        return;
      }
      const data = await res.json();
      setMe(data.user);
    } catch {
      setLoadError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (loading) return <p className="text-sm text-gray-500">読み込み中…</p>;
  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
  if (!me) return null;

  return (
    <div className="flex flex-col gap-6">
      <NameSection initialName={me.name} onSaved={load} />
      <RolesSection
        title="当日用の役割"
        all={DAY_ROLES}
        selected={me.day_roles}
        field="day_roles"
        onSaved={load}
      />
      <RolesSection
        title="研修用の役割"
        all={TRAINING_ROLES}
        selected={me.training_roles}
        field="training_roles"
        onSaved={load}
      />
      <LineSection linked={me.line_linked} liffId={liffId} onChanged={load} />
      <WithdrawSection
        onWithdrawn={() => {
          router.push('/');
          router.refresh();
        }}
      />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border bg-white p-4">
      <h2 className="mb-3 font-bold">{title}</h2>
      {children}
    </section>
  );
}

function NameSection({
  initialName,
  onSaved,
}: {
  initialName: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '保存に失敗しました');
        return;
      }
      setMsg('保存しました');
      onSaved();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="名前">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded border px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded border bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          保存
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-green-600">{msg}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Section>
  );
}

function RolesSection({
  title,
  all,
  selected,
  field,
  onSaved,
}: {
  title: string;
  all: readonly string[];
  selected: string[];
  field: 'day_roles' | 'training_roles';
  onSaved: () => void;
}) {
  const [set, setSet] = useState<Set<string>>(new Set(selected));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(role: string) {
    const next = new Set(set);
    if (next.has(role)) next.delete(role);
    else next.add(role);
    setSet(next);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: Array.from(set) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '保存に失敗しました');
        return;
      }
      setMsg('保存しました');
      onSaved();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title={title}>
      <div className="flex flex-wrap gap-3">
        {all.map((role) => (
          <label key={role} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={set.has(role)}
              onChange={() => toggle(role)}
            />
            {role}
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="mt-3 rounded border bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        保存
      </button>
      {msg && <p className="mt-2 text-sm text-green-600">{msg}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Section>
  );
}

function LineSection({
  linked,
  liffId,
  onChanged,
}: {
  linked: boolean;
  liffId: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveLineId(lineUserId: string | null) {
    const res = await fetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line_user_id: lineUserId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? '保存に失敗しました');
    }
  }

  async function link() {
    if (!liffId) return;
    setBusy(true);
    setError(null);
    try {
      const liff = await loadLiffScript();
      await liff.init({ liffId });
      if (!liff.isLoggedIn()) {
        liff.login();
        return; // リダイレクトされる
      }
      const profile = await liff.getProfile();
      await saveLineId(profile.userId);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'LINE連携に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    setError(null);
    try {
      await saveLineId(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : '解除に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="LINE連携">
      {linked ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="text-sm text-green-700">連携済み ✓</span>
          <button
            type="button"
            disabled={busy}
            onClick={unlink}
            className="rounded border px-4 py-2 text-sm disabled:opacity-50"
          >
            連携解除
          </button>
        </div>
      ) : liffId ? (
        <button
          type="button"
          disabled={busy}
          onClick={link}
          className="rounded border bg-green-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? '連携中…' : 'LINEと連携する'}
        </button>
      ) : (
        <p className="text-sm text-gray-500">
          LINE連携は未設定です（管理者が LIFF ID を設定すると利用できます）。
        </p>
      )}
      <p className="mt-2 text-xs text-gray-400">
        連携するとシフト確定や通知を LINE で受け取れます。
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Section>
  );
}

function WithdrawSection({ onWithdrawn }: { onWithdrawn: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    if (!window.confirm('本当に脱退しますか？この操作は元に戻せません。')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/users/me', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '処理に失敗しました');
        return;
      }
      onWithdrawn();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="脱退">
      <p className="mb-3 text-sm text-gray-600">
        脱退するとログインできなくなります。
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={withdraw}
        className="rounded border border-red-300 px-4 py-2 text-sm text-red-700 disabled:opacity-50"
      >
        脱退する
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Section>
  );
}
