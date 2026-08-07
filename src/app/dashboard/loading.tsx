// スタッフ画面の読み込み中に出す骨組み。
//
// これが無いと、タブを押してからサーバーの応答が返るまで画面が固まったように見える
// （このアプリは全ページが認証つきの動的レンダリングなので、必ず往復が発生する）。
// レイアウト（ヘッダー・ナビ）は先に描かれ、本文だけがこの骨組みに差し替わる。
//
// 配下のページ（shifts / products / suggestions / surveys / settings）が
// 自前の loading.tsx を持たない限り、すべてここが使われる。
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">読み込み中</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse rounded border bg-white p-4">
          <div className="h-4 w-1/3 rounded bg-gray-200" />
          <div className="mt-3 h-3 w-2/3 rounded bg-gray-100" />
          <div className="mt-2 h-3 w-1/2 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}
