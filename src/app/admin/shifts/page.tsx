import { redirect } from 'next/navigation';
import { authenticateAdmin } from '@/lib/middleware';

// 認証必須の管理画面（シフト枠作成・一覧）。フェーズ C で実装する。
export default async function AdminShifts() {
  const auth = await authenticateAdmin();
  if (!auth.ok) redirect('/admin');

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-xl font-bold">シフト管理（管理画面）</h1>
      <p className="text-xs text-gray-400">
        シフト枠の作成・一覧はフェーズ C で実装予定です。
      </p>
    </main>
  );
}
