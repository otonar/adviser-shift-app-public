// オフライン時のフォールバックページ（PWA）。
// ネットワークが無い状態でキャッシュ外のページを開いたときに表示される。
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-bold">オフラインです</h1>
      <p className="text-sm text-gray-600">
        インターネット接続がありません。接続を確認して、もう一度お試しください。
      </p>
    </div>
  );
}
