'use client';

import { useEffect, useState, useCallback } from 'react';
import { DAY_ROLES, TRAINING_ROLES } from '@/types';

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
  // 開いている（操作を出している）メンバー
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // パスワードリセットで発行した一時パスワード（1回だけ表示）。
  const [resetResult, setResetResult] = useState<{
    name: string;
    tempPassword: string;
  } | null>(null);

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

  async function resetPassword(member: Member) {
    if (
      !window.confirm(
        `「${member.name}」のパスワードをリセットしますか？\n新しい仮パスワードが1回だけ表示されます。`
      )
    ) {
      return;
    }
    setBusyId(member.id);
    setError(null);
    try {
      const res = await fetch(`/api/users/${member.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'リセットに失敗しました');
        return;
      }
      setResetResult({ name: data.name, tempPassword: data.tempPassword });
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setBusyId(null);
    }
  }

  const q = query.trim();
  const match = (m: Member) => q === '' || m.name.includes(q);
  const active = members.filter((m) => m.is_active);
  const inactive = members.filter((m) => !m.is_active);
  const unlinked = active.filter((m) => !m.line_linked).length;
  const shownActive = active.filter(match);
  const shownInactive = inactive.filter(match);

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      {resetResult && (
        <TempPasswordBanner
          name={resetResult.name}
          tempPassword={resetResult.tempPassword}
          onClose={() => setResetResult(null)}
        />
      )}
      {loading && <p className="text-sm text-gray-500">読み込み中…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && members.length === 0 && (
        <p className="text-sm text-gray-500">メンバーはいません。</p>
      )}
      {members.length > 0 && (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="名前で絞り込み"
            aria-label="名前で絞り込み"
            className="max-w-xs rounded border px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-500">
            在籍 {active.length} 名{inactive.length > 0 && `・脱退済み ${inactive.length} 名`}
            {unlinked > 0 && `・LINE 未連携 ${unlinked} 名`}。名前を押すと役割の編集やパスワードのリセットができます。
          </p>
          <ul className="divide-y rounded border bg-white">
            {shownActive.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                busy={busyId === m.id}
                open={openId === m.id}
                onToggle={() => setOpenId((id) => (id === m.id ? null : m.id))}
                onSetActive={(v) => setActive(m, v)}
                onResetPassword={() => resetPassword(m)}
                onSaved={() => {
                  setOpenId(null);
                  void load();
                }}
              />
            ))}
            {shownActive.length === 0 && (
              <li className="p-3 text-sm text-gray-500">該当するメンバーはいません。</li>
            )}
          </ul>
          {shownInactive.length > 0 && (
            <details>
              <summary className="press-row cursor-pointer rounded border bg-white px-3 py-2 text-sm text-gray-600">
                脱退済み（{shownInactive.length}名）
              </summary>
              <ul className="mt-2 divide-y rounded border bg-white">
                {shownInactive.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    busy={busyId === m.id}
                    open={openId === m.id}
                    onToggle={() => setOpenId((id) => (id === m.id ? null : m.id))}
                    onSetActive={(v) => setActive(m, v)}
                    onResetPassword={() => resetPassword(m)}
                    onSaved={() => {
                      setOpenId(null);
                      void load();
                    }}
                  />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

// 1メンバーの行。押すと開いて、役割の編集と操作（パスワードリセット・脱退/復帰）が出る。
// 以前は表の毎行に「役割編集・PWリセット・強制脱退」が並び、50人で150個のボタンになっていた
// （スマホでは横スクロールの奥。2026-11-24 UI 見直し G2）。
function MemberRow({
  member,
  busy,
  open,
  onToggle,
  onSetActive,
  onResetPassword,
  onSaved,
}: {
  member: Member;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onSetActive: (active: boolean) => void;
  onResetPassword: () => void;
  onSaved: () => void;
}) {
  const roles = [
    member.day_roles.length > 0 && `当日: ${member.day_roles.join('・')}`,
    member.training_roles.length > 0 && `研修: ${member.training_roles.join('・')}`,
  ].filter(Boolean);
  return (
    <li className={member.is_active ? '' : 'bg-gray-50'}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="press-row flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-gray-50"
      >
        <span className="min-w-0">
          <span className={`font-medium ${member.is_active ? '' : 'text-gray-500'}`}>
            {member.name}
          </span>
          {!member.line_linked && member.is_active && (
            <span className="ml-2 whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
              LINE 未連携
            </span>
          )}
          <span className="block truncate text-xs text-gray-500">
            {roles.length > 0 ? roles.join(' ／ ') : '役割なし'}
          </span>
        </span>
        <span aria-hidden="true" className="text-gray-400">
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-4 border-t bg-gray-50 px-3 py-3">
          {member.is_active && (
            <RoleEditor member={member} onSaved={onSaved} onCancel={onToggle} />
          )}
          <div className="flex flex-wrap gap-2 border-t pt-3">
            {member.is_active && (
              <button
                type="button"
                disabled={busy}
                onClick={onResetPassword}
                className="rounded border bg-white px-3 py-1.5 text-xs disabled:opacity-50"
              >
                パスワードをリセット
              </button>
            )}
            {member.is_active ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onSetActive(false)}
                className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs text-red-700 disabled:opacity-50"
              >
                強制脱退
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => onSetActive(true)}
                className="rounded border bg-white px-3 py-1.5 text-xs disabled:opacity-50"
              >
                在籍に戻す
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

// 管理者によるメンバーの役割編集（当日用・研修用）。
function RoleEditor({
  member,
  onSaved,
  onCancel,
}: {
  member: Member;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [day, setDay] = useState<Set<string>>(new Set(member.day_roles));
  const [training, setTraining] = useState<Set<string>>(
    new Set(member.training_roles)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, role: string) {
    const next = new Set(set);
    if (next.has(role)) next.delete(role);
    else next.add(role);
    setSet(next);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day_roles: Array.from(day),
          training_roles: Array.from(training),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '保存に失敗しました');
        return;
      }
      onSaved();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1 text-xs font-bold text-gray-500">当日用の役割</p>
        <div className="flex flex-wrap gap-3">
          {DAY_ROLES.map((role) => (
            <label key={role} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={day.has(role)}
                onChange={() => toggle(day, setDay, role)}
              />
              {role}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-bold text-gray-500">研修用の役割</p>
        <div className="flex flex-wrap gap-3">
          {TRAINING_ROLES.map((role) => (
            <label key={role} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={training.has(role)}
                onChange={() => toggle(training, setTraining, role)}
              />
              {role}
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded border bg-gray-900 px-4 py-1.5 text-xs text-white disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存'}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="rounded border px-4 py-1.5 text-xs disabled:opacity-50"
        >
          閉じる
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}

// パスワードリセット直後に一時パスワードを1回だけ表示するバナー。
// 閉じると再表示できない旨を明示し、コピーできるようにする。
function TempPasswordBanner({
  name,
  tempPassword,
  onClose,
}: {
  name: string;
  tempPassword: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボード不可の環境では手動で選択・コピーしてもらう
    }
  }

  return (
    <div className="rounded border border-amber-300 bg-amber-50 p-3">
      <p className="text-sm font-bold text-amber-800">
        「{name}」の仮パスワードを発行しました
      </p>
      <p className="mt-1 text-xs text-amber-700">
        この画面を閉じると再表示できません。本人に伝えて、ログイン後にパスワードを変更するよう案内してください。
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="select-all rounded border bg-white px-3 py-1.5 font-mono text-base tracking-wider">
          {tempPassword}
        </code>
        <button
          type="button"
          onClick={copy}
          className="rounded border px-3 py-1.5 text-xs"
        >
          {copied ? 'コピーしました' : 'コピー'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded border px-3 py-1.5 text-xs"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
