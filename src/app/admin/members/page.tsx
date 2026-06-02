import { redirect } from 'next/navigation';
import { authenticateAdmin } from '@/lib/middleware';
import MemberManager from '@/components/admin/MemberManager';

// 管理画面: メンバー一覧・強制脱退。
export default async function AdminMembersPage() {
  const auth = await authenticateAdmin();
  if (!auth.ok) redirect('/admin');

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">メンバー管理</h1>
      <MemberManager />
    </div>
  );
}
