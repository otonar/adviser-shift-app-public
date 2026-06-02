'use client';

import { useState } from 'react';

// パスワード入力欄＋表示/非表示トグル。入力内容を一時的に確認できる。
export default function PasswordInput({
  value,
  onChange,
  autoComplete,
  required = true,
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoComplete={autoComplete}
        className="w-full rounded border px-3 py-2 pr-14"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={show ? 'パスワードを隠す' : 'パスワードを表示'}
        className="absolute inset-y-0 right-0 px-3 text-xs text-gray-500"
      >
        {show ? '隠す' : '表示'}
      </button>
    </div>
  );
}
