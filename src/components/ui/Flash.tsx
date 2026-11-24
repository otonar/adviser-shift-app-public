'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// 完了メッセージ（「保存しました ✓」など）の共通部品。
// 画面ごとに言い回し・消える/残るがばらばらだったので（2026-11-24 UI 見直し G3）、
// 「〜しました ✓」を緑で出して数秒で消す、に揃える。
// 消えると困る内容（LINE で知らせられなかった人の名前など）はこれを使わず、画面に残す。

const FLASH_MS = 3000;

export function useFlash(ms: number = FLASH_MS) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback(
    (text: string) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(text);
      timer.current = setTimeout(() => setMessage(null), ms);
    },
    [ms]
  );
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(null);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return { message, flash, clear };
}

export function FlashMessage({
  message,
  className = '',
}: {
  message: string | null;
  className?: string;
}) {
  // 無いときは何も描かない（空の行が余白を取らないように）。読み上げ向けに role=status
  if (!message) return null;
  return (
    <p role="status" className={`text-sm font-bold text-green-700 ${className}`}>
      {message} ✓
    </p>
  );
}
