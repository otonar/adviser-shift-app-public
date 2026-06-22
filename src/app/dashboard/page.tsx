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
        <Link
          href="/dashboard/products"
          className="rounded border bg-white p-4 text-center"
        >
          商品情報
        </Link>
        <Link
          href="/dashboard/suggestions"
          className="rounded border bg-white p-4 text-center"
        >
          目安箱
        </Link>
        <Link
          href="/dashboard/settings"
          className="rounded border bg-white p-4 text-center"
        >
          設定
        </Link>
      </div>
    </div>
  );
}
