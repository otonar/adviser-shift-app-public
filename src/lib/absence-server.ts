import 'server-only';
import { getSupabaseAdmin } from './supabase';
import { sendMulticast } from './line';
import { compareSlotsUpcomingFirst, todayJst } from './datetime';
import { CORE_ROLE, type SlotType } from '@/types';

// 欠席連絡のサーバー側の処理（コアメンバーへの通知・一覧の取得）。
// 判定と文面は absence.ts（純粋関数）にある。

const MULTICAST_CHUNK = 500; // LINE multicast の宛先上限

/**
 * コアメンバー全員（在籍中・LINE 連携済み・本人以外）に LINE で送り、notification_logs に残す。
 * LINE 未連携のコアメンバーには届かないので、アプリの一覧（/dashboard/absences）で見てもらう。
 * 送信の失敗で連絡そのものは取り消さない（DB には残っていて一覧に出るため）。
 * @returns LINE で届けられた人数
 */
export async function notifyCoreMembers(
  reporterId: string,
  message: string
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data: cores, error } = await supabase
    .from('users')
    .select('id, line_user_id')
    .eq('is_active', true)
    .contains('training_roles', [CORE_ROLE])
    .neq('id', reporterId);
  if (error || !cores) return 0;

  const linked = cores.filter(
    (u): u is { id: string; line_user_id: string } => !!u.line_user_id
  );

  let allOk = linked.length > 0;
  for (let i = 0; i < linked.length; i += MULTICAST_CHUNK) {
    const ids = linked.slice(i, i + MULTICAST_CHUNK).map((u) => u.line_user_id);
    if (!(await sendMulticast(ids, message))) allOk = false;
  }

  // 未連携の人も failed として残す（誰に届いていないかを通知履歴で追えるように）
  const logs = cores.map((u) => ({
    user_id: u.id,
    notification_type: 'absence_report' as const,
    message,
    status: u.line_user_id && allOk ? ('sent' as const) : ('failed' as const),
  }));
  if (logs.length > 0) await supabase.from('notification_logs').insert(logs);

  return allOk ? linked.length : 0;
}

export type AbsenceListItem = {
  id: string;
  reason: string;
  created_at: string;
  user_name: string;
  // 確定済みの割り振りがあればその役割（無ければ null）
  role: string | null;
  slot: {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    slot_type: SlotType;
    title: string | null;
  };
};

type JoinedSlot = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  slot_type: SlotType;
  title: string | null;
  assignment_status: string;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * 今日以降のシフトに出ている欠席連絡（コアメンバーの一覧用）。シフトの近い順。
 * 取得に失敗したら throw する（画面で「失敗」と「0件」を区別するため）。
 */
export async function fetchUpcomingAbsences(): Promise<AbsenceListItem[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('absence_reports')
    .select(
      'id, user_id, shift_slot_id, reason, created_at, users(name), shift_slots!inner(id, date, start_time, end_time, slot_type, title, assignment_status)'
    )
    .gte('shift_slots.date', todayJst());
  if (error) throw new Error('absence_reports の取得に失敗しました');

  const rows = (data ?? [])
    .map((r) => ({ r, slot: one(r.shift_slots as JoinedSlot | JoinedSlot[] | null) }))
    .filter((x): x is { r: typeof x.r; slot: JoinedSlot } => x.slot !== null);
  if (rows.length === 0) return [];

  // 役割は確定済みの枠のぶんだけ引く（調整中の割り振りは本人に見せていないものなので出さない）
  const publishedSlotIds = [
    ...new Set(rows.filter((x) => x.slot.assignment_status === 'published').map((x) => x.slot.id)),
  ];
  const roleByKey = new Map<string, string>();
  if (publishedSlotIds.length > 0) {
    const { data: assigns } = await supabase
      .from('shift_assignments')
      .select('user_id, shift_slot_id, role')
      .in('shift_slot_id', publishedSlotIds)
      .in(
        'user_id',
        rows.map((x) => x.r.user_id as string)
      );
    for (const a of assigns ?? []) roleByKey.set(`${a.shift_slot_id}:${a.user_id}`, a.role);
  }

  return rows
    .map(({ r, slot }) => ({
      id: r.id as string,
      reason: r.reason as string,
      created_at: r.created_at as string,
      user_name: one(r.users as { name: string } | { name: string }[] | null)?.name ?? '(不明)',
      role: roleByKey.get(`${slot.id}:${r.user_id}`) ?? null,
      slot: {
        id: slot.id,
        date: slot.date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        slot_type: slot.slot_type,
        title: slot.title ?? null,
      },
    }))
    .sort((a, b) => compareSlotsUpcomingFirst(a.slot, b.slot));
}
