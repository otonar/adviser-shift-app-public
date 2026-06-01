import { redirect } from 'next/navigation';
import { authenticateUser } from '@/lib/middleware';
import { getSupabaseAdmin } from '@/lib/supabase';

type Row = {
  role: string;
  slot: {
    date: string;
    start_time: string;
    end_time: string;
    slot_type: 'day' | 'training';
    assignment_status: string;
  } | null;
};

// published のシフトのみ、自分に割り振られた役割を日付順に表示する。
export default async function MyRolesPage() {
  const auth = await authenticateUser();
  if (!auth.ok) redirect('/');

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('shift_assignments')
    .select(
      'role, shift_slots(date, start_time, end_time, slot_type, assignment_status)'
    )
    .eq('user_id', auth.userId);

  const rows: Row[] = (data ?? []).map((r) => {
    const slot = Array.isArray(r.shift_slots) ? r.shift_slots[0] : r.shift_slots;
    return { role: r.role, slot: slot ?? null };
  });

  const published = rows
    .filter((r) => r.slot && r.slot.assignment_status === 'published')
    .sort((a, b) => (a.slot!.date < b.slot!.date ? -1 : 1));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">確定した役割</h1>
      {published.length === 0 ? (
        <p className="text-sm text-gray-500">
          公開済みの割り当てはまだありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {published.map((r, i) => (
            <li key={i} className="rounded border bg-white p-4">
              <p className="font-bold">
                {r.slot!.date}（{r.slot!.slot_type === 'day' ? '当日' : '研修'}）
              </p>
              <p className="text-sm text-gray-600">
                {r.slot!.start_time.slice(0, 5)}〜{r.slot!.end_time.slice(0, 5)}
              </p>
              <p className="mt-1">
                役割: <span className="font-bold">{r.role}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
