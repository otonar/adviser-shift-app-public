import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authenticateAdmin } from '@/lib/middleware';
import ShiftDetail from '@/components/admin/ShiftDetail';

// 管理画面: シフト詳細・提出状況・役割調整・公開。
export default async function AdminShiftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await authenticateAdmin();
  if (!auth.ok) redirect('/admin');

  const { id } = await params;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/shifts" className="text-sm text-gray-500">
        ← シフト一覧へ戻る
      </Link>
      <ShiftDetail shiftId={id} />
    </div>
  );
}
