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
  const [editingId, setEditingId] = useState<string | null>(null);
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

  return (
    <div className="flex flex-col gap-3">
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
                <FragmentRow
                  key={m.id}
                  member={m}
                  busy={busyId === m.id}
                  editing={editingId === m.id}
                  onToggleEdit={() =>
                    setEditingId((id) => (id === m.id ? null : m.id))
                  }
                  onSetActive={(active) => setActive(m, active)}
                  onResetPassword={() => resetPassword(m)}
                  onSaved={() => {
                    setEditingId(null);
                    load();
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// 1メンバーの表示行＋（編集中なら）役割編集の展開行。
function FragmentRow({
  member,
  busy,
  editing,
  onToggleEdit,
  onSetActive,
  onResetPassword,
  onSaved,
}: {
  member: Member;
  busy: boolean;
  editing: boolean;
  onToggleEdit: () => void;
  onSetActive: (active: boolean) => void;
  onResetPassword: () => void;
  onSaved: () => void;
}) {
  return (
    <>
      <tr
        className={`border-b last:border-b-0 ${
          member.is_active ? '' : 'bg-gray-50 text-gray-400'
        }`}
      >
        <td className="px-3 py-2 font-medium">{member.name}</td>
        <td className="px-3 py-2">{member.day_roles.join('・') || '—'}</td>
        <td className="px-3 py-2">{member.training_roles.join('・') || '—'}</td>
        <td className="px-3 py-2">{member.line_linked ? '連携済み' : '未連携'}</td>
        <td className="px-3 py-2">
          {member.is_active ? (
            <span className="text-green-700">在籍</span>
          ) : (
            <span className="text-gray-500">脱退済み</span>
          )}
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={onToggleEdit}
              className="rounded border px-2 py-1 text-xs"
            >
              {editing ? '閉じる' : '役割編集'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onResetPassword}
              className="rounded border px-2 py-1 text-xs disabled:opacity-50"
            >
              PWリセット
            </button>
            {member.is_active ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onSetActive(false)}
                className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
              >
                強制脱退
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => onSetActive(true)}
                className="rounded border px-2 py-1 text-xs disabled:opacity-50"
              >
                復帰
              </button>
            )}
          </div>
        </td>
      </tr>
      {editing && (
        <tr className="border-b last:border-b-0 bg-gray-50">
          <td colSpan={6} className="px-3 py-3">
            <RoleEditor member={member} onSaved={onSaved} onCancel={onToggleEdit} />
          </td>
        </tr>
      )}
    </>
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
          取消
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
