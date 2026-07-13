'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

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
  login: (config?: { redirectUri?: string }) => void;
  getProfile: () => Promise<{ userId: string }>;
  // 公式アカウントを LINE ログインチャネルにリンクしていると使える。友だち状態を返す。
  getFriendship?: () => Promise<{ friendFlag: boolean }>;
};
declare global {
  interface Window {
    liff?: LiffModule;
  }
}

// LINE ログインへリダイレクトする直前に立てる目印。外部ブラウザではログイン後に
// このページへ戻ってくるので、戻った時に自動で連携を完了するために使う。
const LINK_PENDING_KEY = 'line-link-pending';

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

export default function SettingsPanel({
  liffId,
  addFriendUrl,
}: {
  liffId: string | null;
  addFriendUrl: string | null;
}) {
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
      <PasswordSection />
      <RolesInfo dayRoles={me.day_roles} trainingRoles={me.training_roles} />
      <LineSection
        linked={me.line_linked}
        liffId={liffId}
        addFriendUrl={addFriendUrl}
        onChanged={load}
      />
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

// 本人によるパスワード変更。現在のパスワード確認あり。仮パスワードで入った人も
// ここで自分の好きなパスワードに変えられる。
function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setMsg(null);
    setError(null);
    if (next.length < 8) {
      setError('新しいパスワードは8文字以上にしてください');
      return;
    }
    if (next !== confirm) {
      setError('確認用のパスワードが一致しません');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/users/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '変更に失敗しました');
        return;
      }
      setMsg('パスワードを変更しました');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="パスワード変更">
      <div className="flex flex-col gap-2">
        <input
          type="password"
          autoComplete="current-password"
          placeholder="現在のパスワード"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="新しいパスワード（8文字以上）"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="新しいパスワード（確認）"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={saving || !current || !next || !confirm}
          onClick={save}
          className="self-start rounded border bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? '変更中…' : 'パスワードを変更'}
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-green-600">{msg}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Section>
  );
}

// 役割は本人では変更できない（管理者が設定）。現在の役割を閲覧専用で表示する。
function RolesInfo({
  dayRoles,
  trainingRoles,
}: {
  dayRoles: string[];
  trainingRoles: string[];
}) {
  return (
    <Section title="役割">
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-gray-500">当日用</dt>
          <dd>{dayRoles.length > 0 ? dayRoles.join('・') : '（なし）'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-gray-500">研修用</dt>
          <dd>
            {trainingRoles.length > 0 ? trainingRoles.join('・') : '（なし）'}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-gray-400">
        役割は管理者が設定します。変更が必要な場合は管理者に連絡してください。
      </p>
    </Section>
  );
}

function LineSection({
  linked,
  liffId,
  addFriendUrl,
  onChanged,
}: {
  linked: boolean;
  liffId: string | null;
  addFriendUrl: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 友だち状態: true=友だち / false=未追加 / null=不明（判定できなかった）
  const [friend, setFriend] = useState<boolean | null>(null);

  // すでに連携済みで LIFF にログインが残っている場合は、友だち状態を確認する。
  // ログインが残っていない通常訪問では確認できない（null のまま＝控えめな案内を出す）。
  useEffect(() => {
    if (!liffId || !linked || !addFriendUrl || friend !== null) return;
    const id = liffId;
    let cancelled = false;
    void (async () => {
      try {
        const liff = await loadLiffScript();
        await liff.init({ liffId: id });
        if (!liff.isLoggedIn() || !liff.getFriendship) return;
        const fr = await liff.getFriendship();
        if (!cancelled) setFriend(fr.friendFlag);
      } catch {
        /* 判定不可はそのまま（null） */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liffId, linked, addFriendUrl, friend]);

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

  // 外部ブラウザで LINE ログインから戻ってきたときに、自動で連携を完了する。
  // login() 直前に立てた目印がある場合のみ実行（通常の設定画面表示では走らない）。
  useEffect(() => {
    if (!liffId || linked) return;
    const id = liffId;
    let pending = false;
    try {
      pending = sessionStorage.getItem(LINK_PENDING_KEY) === '1';
    } catch {
      /* sessionStorage 不可なら何もしない */
    }
    if (!pending) return;
    try {
      sessionStorage.removeItem(LINK_PENDING_KEY);
    } catch {
      /* noop */
    }
    let cancelled = false;
    void (async () => {
      try {
        const liff = await loadLiffScript();
        await liff.init({ liffId: id });
        if (!liff.isLoggedIn()) return; // 応答が未処理なら何もしない
        const profile = await liff.getProfile();
        if (cancelled) return;
        await saveLineId(profile.userId);
        if (!cancelled) onChanged();
        // 連携直後に友だち状態を確認（未追加なら案内を出すため）。
        if (liff.getFriendship) {
          try {
            const fr = await liff.getFriendship();
            if (!cancelled) setFriend(fr.friendFlag);
          } catch {
            /* 判定不可は無視 */
          }
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'LINE連携に失敗しました');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liffId, linked, onChanged]);

  async function link() {
    if (!liffId) return;
    setBusy(true);
    setError(null);
    try {
      const liff = await loadLiffScript();
      await liff.init({ liffId });
      if (!liff.isLoggedIn()) {
        // 戻ってきたときに自動完了できるよう目印を立て、確実にこのページへ戻す。
        try {
          sessionStorage.setItem(LINK_PENDING_KEY, '1');
        } catch {
          /* noop */
        }
        liff.login({ redirectUri: window.location.href });
        return; // リダイレクトされる（戻ると上の useEffect が連携を完了する）
      }
      const profile = await liff.getProfile();
      await saveLineId(profile.userId);
      onChanged();
      if (liff.getFriendship) {
        try {
          const fr = await liff.getFriendship();
          setFriend(fr.friendFlag);
        } catch {
          /* 判定不可は無視 */
        }
      }
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
        <div className="flex flex-col gap-3">
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

          {/* 通知は「公式アカウントを友だち追加した人」にしか届かないため、
              未追加（または不明）なら友だち追加へ誘導する。 */}
          {addFriendUrl && friend === false && (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-800">
              <p className="mb-2">
                ⚠️ 通知を受け取るには、公式アカウントの
                <strong>友だち追加</strong>が必要です。
              </p>
              <a
                href={addFriendUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded bg-green-600 px-4 py-2 text-sm text-white"
              >
                LINEで友だち追加
              </a>
            </div>
          )}
          {addFriendUrl && friend === true && (
            <p className="text-xs text-green-700">友だち追加済み ✓ 通知を受け取れます。</p>
          )}
          {addFriendUrl && friend === null && (
            <p className="text-xs text-gray-500">
              通知が届かない場合は{' '}
              <a
                href={addFriendUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-700 underline"
              >
                友だち追加
              </a>{' '}
              をご確認ください。
            </p>
          )}
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
