import CardSkeleton from '@/components/ui/CardSkeleton';

// スタッフ画面の読み込み中に出す骨組み。
//
// これが無いと、タブを押してからサーバーの応答が返るまで画面が固まったように見える
// （このアプリは全ページが認証つきの動的レンダリングなので、必ず往復が発生する）。
// レイアウト（ヘッダー・ナビ）は先に描かれ、本文だけがこの骨組みに差し替わる。
//
// 配下のページ（shifts / products / suggestions / surveys / settings）が
// 自前の loading.tsx を持たない限り、すべてここが使われる。
export default function DashboardLoading() {
  return <CardSkeleton />;
}
