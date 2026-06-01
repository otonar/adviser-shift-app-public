import { redirect } from 'next/navigation';
import { authenticateAdmin } from '@/lib/middleware';
import AdminShifts from '@/components/admin/AdminShifts';

// 管理画面: シフト枠作成・一覧。
export default async function AdminShiftsPage() {
  const auth = await authenticateAdmin();
  if (!auth.ok) redirect('/admin');

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">シフト管理</h1>
      <AdminShifts />
    </div>
  );
}
