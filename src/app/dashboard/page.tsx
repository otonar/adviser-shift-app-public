import Link from 'next/link';

// スタッフダッシュボード（直近シフト概要への入口）。レイアウトで認証済み。
export default function Dashboard() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-bold">ダッシュボード</h1>
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/dashboard/shifts"
          className="rounded border bg-white p-4 text-center"
        >
          シフト希望提出
        </Link>
        <Link
          href="/dashboard/my-roles"
          className="rounded border bg-white p-4 text-center"
        >
          確定した役割
        </Link>
      </div>
      <p className="text-xs text-gray-400">
        商品・設定はフェーズ D で追加予定です。
      </p>
    </div>
  );
}
