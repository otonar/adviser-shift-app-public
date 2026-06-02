import { redirect } from 'next/navigation';
import { authenticateAdmin } from '@/lib/middleware';
import NotificationPanel from '@/components/admin/NotificationPanel';

// 管理画面: LINE 通知送信・ログ確認。
export default async function AdminNotificationsPage() {
  const auth = await authenticateAdmin();
  if (!auth.ok) redirect('/admin');

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">LINE通知</h1>
      <NotificationPanel />
    </div>
  );
}
