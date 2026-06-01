// ルートページ。フェーズBで認証状態に応じたログイン/ダッシュボードへの
// リダイレクトを実装する。現状はプレースホルダー。
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">シフト管理</h1>
      <p className="text-sm text-gray-600">大学生協 新入生事業部</p>
      <p className="text-xs text-gray-400">
        セットアップ中です（フェーズ A: 基盤構築完了）
      </p>
    </main>
  );
}
