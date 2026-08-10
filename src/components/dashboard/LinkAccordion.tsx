'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { QrPath } from '@/lib/qr';

export type LinkSection = {
  id: string;
  emoji: string;
  title: string;
  description?: string;
  /** QR はサーバー側で作ったパスを受け取る（QR ライブラリをブラウザに送らない）。 */
  link?: { url: string; label: string; qr: QrPath };
  poster?: { src: string; alt: string; width: number; height: number };
};

// 外部リンク集のアコーディオン。
// 移植元と同じく「それぞれ独立して開閉できる」（複数同時に開ける）。
// 見比べながら使う画面なので、アンケート画面のような1つだけ開く方式にはしていない。
export default function LinkAccordion({ sections }: { sections: LinkSection[] }) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpenIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (sections.length === 0) {
    return <p className="text-sm text-gray-500">表示できるリンクはまだありません。</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {sections.map((s) => {
        const open = openIds.has(s.id);
        return (
          <div key={s.id}>
            <button
              type="button"
              onClick={() => toggle(s.id)}
              aria-expanded={open}
              aria-controls={`link-panel-${s.id}`}
              className="flex w-full items-center justify-between gap-2 rounded border bg-white p-4 text-left font-bold hover:bg-gray-50 active:bg-gray-50"
            >
              <span>
                {s.emoji} {s.title}
              </span>
              {/* 開閉の印。読み上げには aria-expanded があるので装飾扱いにする */}
              <span aria-hidden="true" className="text-xl text-gray-500">
                {open ? '−' : '＋'}
              </span>
            </button>

            {open && (
              <div
                id={`link-panel-${s.id}`}
                className="mt-1 flex flex-col items-center gap-4 rounded border bg-white p-4 text-center"
              >
                {s.description && (
                  <p className="text-sm text-gray-600">{s.description}</p>
                )}

                {s.link && (
                  <>
                    <a
                      href={s.link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block rounded bg-gray-900 px-5 py-3 text-sm font-bold text-white"
                    >
                      {s.link.label}
                    </a>
                    {/* 新入生に画面を見せて読み取ってもらうための QR */}
                    <figure className="flex flex-col items-center gap-1">
                      <QrCode qr={s.link.qr} title={`${s.title} の QR コード`} />
                      <figcaption className="text-xs text-gray-400">
                        QRコード
                      </figcaption>
                    </figure>
                  </>
                )}

                {s.poster && (
                  <Image
                    src={s.poster.src}
                    alt={s.poster.alt}
                    width={s.poster.width}
                    height={s.poster.height}
                    className="h-auto w-full max-w-md rounded border"
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function QrCode({ qr, title }: { qr: QrPath; title: string }) {
  return (
    <svg
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      role="img"
      aria-label={title}
      // マス目の境界をぼかさない（ぼけると読み取り精度が落ちる）
      shapeRendering="crispEdges"
      className="h-36 w-36 rounded border bg-white p-1"
    >
      <path d={qr.d} fill="#000000" />
    </svg>
  );
}
