import { redirect } from 'next/navigation';
import { authenticateUser } from '@/lib/middleware';
import { fetchMyPublishedRoles } from '@/lib/staff-queries';
import StaffShifts from '@/components/dashboard/StaffShifts';

// シフト画面。「希望を出す」と「確定した役割」を1画面にまとめている。
// ?view=roles で役割側を開いた状態にする（旧 /dashboard/my-roles からの遷移先）。
export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const auth = await authenticateUser();
  if (!auth.ok) redirect('/');

  const { view } = await searchParams;
  const roles = await fetchMyPublishedRoles(auth.userId);

  return (
    <StaffShifts
      myRoles={roles}
      initialView={view === 'roles' ? 'roles' : 'submit'}
    />
  );
}
