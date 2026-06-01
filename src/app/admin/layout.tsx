import { authenticateAdmin } from '@/lib/middleware';
import AdminSidebar from '@/components/layout/AdminSidebar';

// 管理画面レイアウト。ログイン済みのときだけサイドバーを表示する
// （ログインページ /admin ではサイドバーを出さない）。
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await authenticateAdmin();

  if (!auth.ok) {
    // 未認証（ログインページ等）はそのまま表示
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen md:flex">
      <AdminSidebar />
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
