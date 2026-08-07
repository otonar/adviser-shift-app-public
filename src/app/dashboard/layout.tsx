import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authenticateUser } from '@/lib/middleware';
import BottomNav from '@/components/layout/BottomNav';
import GearIcon from '@/components/ui/GearIcon';

// スタッフ用レイアウト。未認証はログインへ。スマホは下部ナビ、PC は上部ナビ。
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await authenticateUser();
  if (!auth.ok) redirect('/');

  return (
    // 下部ナビ（高さ 80px ＋ セーフエリア）に本文が隠れないよう余白を取る
    <div className="min-h-screen pb-28 md:pb-0">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between p-3">
          {/* タイトルはダッシュボードへの入口を兼ねる */}
          <Link href="/dashboard" className="font-bold">
            シフト管理
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">{auth.name} さん</span>
            {/*
              設定は使用頻度が低いので下部ナビから外し、ヘッダーの歯車に置いた。
              アイコンだけのボタンは当たり判定が小さくなりがちなので、
              余白込みで 44px 四方（指で押せる大きさ）を確保する。
            */}
            <Link
              href="/dashboard/settings"
              aria-label="設定"
              title="設定"
              className="rounded-full p-2.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-100"
            >
              <GearIcon className="h-6 w-6" />
            </Link>
          </div>
        </div>
        <div className="hidden md:block">
          <BottomNav variant="top" />
        </div>
      </header>
      <main className="mx-auto max-w-2xl p-4">{children}</main>
      <div className="md:hidden">
        <BottomNav variant="bottom" />
      </div>
    </div>
  );
}
