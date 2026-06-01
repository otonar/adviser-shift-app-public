import { redirect } from 'next/navigation';
import { authenticateAdmin } from '@/lib/middleware';
import AdminLoginForm from '@/components/auth/AdminLoginForm';

// 管理画面ログイン（パスワードのみ）。ログイン済みならシフト管理へ。
export default async function AdminLogin() {
  const auth = await authenticateAdmin();
  if (auth.ok) redirect('/admin/shifts');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">管理画面</h1>
        <p className="text-sm text-gray-600">コアメンバー専用</p>
      </div>
      <AdminLoginForm />
    </main>
  );
}
