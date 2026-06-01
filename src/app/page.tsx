import { redirect } from 'next/navigation';
import { authenticateUser } from '@/lib/middleware';
import UserAuthForm from '@/components/auth/UserAuthForm';

// ログイン済みならダッシュボードへ。未認証ならログイン/新規登録フォームを表示。
export default async function Home() {
  const auth = await authenticateUser();
  if (auth.ok) redirect('/dashboard');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">シフト管理</h1>
        <p className="text-sm text-gray-600">大学生協 新入生事業部</p>
      </div>
      <UserAuthForm />
    </main>
  );
}
