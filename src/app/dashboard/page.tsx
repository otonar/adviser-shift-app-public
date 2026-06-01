import { redirect } from 'next/navigation';
import { authenticateUser } from '@/lib/middleware';
import LogoutButton from '@/components/auth/LogoutButton';

// 認証必須のスタッフ用ダッシュボード。フェーズ C で直近シフト概要等を実装する。
export default async function Dashboard() {
  const auth = await authenticateUser();
  if (!auth.ok) redirect('/');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">ダッシュボード</h1>
        <LogoutButton />
      </div>
      <p className="text-sm text-gray-700">
        ようこそ、{auth.name} さん
      </p>
      <p className="text-xs text-gray-400">
        シフト機能はフェーズ C で実装予定です。
      </p>
    </main>
  );
}
