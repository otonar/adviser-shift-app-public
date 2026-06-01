'use client';

import { useState } from 'react';
import { DAY_ROLES, TRAINING_ROLES, type SlotType } from '@/types';

export type SelectableUser = {
  id: string;
  name: string;
  day_roles: string[];
  training_roles: string[];
  line_linked?: boolean;
};

export default function TargetUserSelector({
  users,
  selected,
  onChange,
  slotType,
}: {
  users: SelectableUser[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  slotType: SlotType;
}) {
  const [roleFilter, setRoleFilter] = useState<string | null>(null);

  const roles = slotType === 'day' ? DAY_ROLES : TRAINING_ROLES;
  const rolesOf = (u: SelectableUser) =>
    slotType === 'day' ? u.day_roles : u.training_roles;

  const visible = roleFilter
    ? users.filter((u) => rolesOf(u).includes(roleFilter))
    : users;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function selectAllVisible() {
    const next = new Set(selected);
    visible.forEach((u) => next.add(u.id));
    onChange(next);
  }

  function clearAll() {
    onChange(new Set());
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-gray-500">役割で絞り込み:</span>
        <button
          type="button"
          onClick={() => setRoleFilter(null)}
          className={`rounded border px-2 py-0.5 text-xs ${
            roleFilter === null ? 'bg-gray-900 text-white' : 'bg-white'
          }`}
        >
          全員
        </button>
        {roles.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRoleFilter(r)}
            className={`rounded border px-2 py-0.5 text-xs ${
              roleFilter === r ? 'bg-gray-900 text-white' : 'bg-white'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={selectAllVisible}
          className="rounded border px-2 py-0.5 text-xs"
        >
          表示中を全選択
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded border px-2 py-0.5 text-xs"
        >
          全解除
        </button>
        <span className="text-xs text-gray-500">{selected.size} 名選択中</span>
      </div>

      <div className="max-h-56 overflow-y-auto rounded border">
        {visible.length === 0 && (
          <p className="p-2 text-xs text-gray-500">該当者がいません</p>
        )}
        {visible.map((u) => (
          <label
            key={u.id}
            className="flex items-center gap-2 border-b px-2 py-1.5 text-sm last:border-b-0"
          >
            <input
              type="checkbox"
              checked={selected.has(u.id)}
              onChange={() => toggle(u.id)}
            />
            <span>{u.name}</span>
            <span className="text-xs text-gray-400">
              {rolesOf(u).join('・') || '役割未設定'}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
