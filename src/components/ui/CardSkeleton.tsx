// 読み込み中の骨組み。スタッフ画面の loading.tsx と、画面の中で後から取りに行く所
// （シフト・設定）で同じ見た目にする（2026-11-24 UI 見直し U3。
// それまでは骨組み → 「読み込み中…」の文字 → 本文、と2段階で表示が変わっていた）。
export default function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">読み込み中</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="animate-pulse rounded border bg-white p-4">
          <div className="h-4 w-1/3 rounded bg-gray-200" />
          <div className="mt-3 h-3 w-2/3 rounded bg-gray-100" />
          <div className="mt-2 h-3 w-1/2 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}
