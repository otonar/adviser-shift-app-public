import { redirect } from 'next/navigation';
import { authenticateUser } from '@/lib/middleware';
import BottomNav from '@/components/layout/BottomNav';
import LogoutButton from '@/components/auth/LogoutButton';

// スタッフ用レイアウト。未認証はログインへ。スマホは下部ナビ、PC は上部ナビ。
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await authenticateUser();
  if (!auth.ok) redirect('/');

  return (
    <div className="min-h-screen pb-16 md:pb-0">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between p-3">
          <span className="font-bold">シフト管理</span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{auth.name} さん</span>
            <LogoutButton />
          </div>
        </div>
        <div className="hidden md:block">
          <BottomNav />
        </div>
      </header>
      <main className="mx-auto max-w-2xl p-4">{children}</main>
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
