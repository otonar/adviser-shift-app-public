'use client';

import { useEffect, useRef } from 'react';

// 画面内の確認ダイアログ（2026-11-24 UI 見直し U4）。
// ブラウザ標準の confirm は長い文面（差し替えの変更一覧など）が読みにくく、
// スマホで見た目もばらばらなので、変更内容を見せて確かめる所はこちらを使う。
// <dialog> の showModal を使う＝背面は押せず、Esc で閉じる（＝やめる）。
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'やめる',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="w-[min(28rem,calc(100vw-2rem))] rounded-lg border p-0 backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-3 p-4">
        <h2 className="font-bold">{title}</h2>
        {children && <div className="text-sm text-gray-700">{children}</div>}
        <div className="mt-1 flex flex-row-reverse gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`flex-1 rounded px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${
              danger ? 'bg-red-600' : 'bg-gray-900'
            }`}
          >
            {busy ? '処理中…' : confirmLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 rounded border px-4 py-2 text-sm disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
