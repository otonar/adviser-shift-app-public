import { redirect } from 'next/navigation';
import { authenticateAdmin } from '@/lib/middleware';
import SuggestionManager from '@/components/admin/SuggestionManager';

// 管理画面: 目安箱（スタッフ投稿の閲覧・ステータス管理）。
export default async function AdminSuggestionsPage() {
  const auth = await authenticateAdmin();
  if (!auth.ok) redirect('/admin');

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">目安箱</h1>
      <SuggestionManager />
    </div>
  );
}
