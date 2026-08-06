import 'server-only';
import { getSupabaseAdmin } from './supabase';
import { visibleScopes } from './scope';
import { compareSlotsUpcomingFirst, isExpired, todayJst } from './datetime';

// スタッフ画面のサーバーコンポーネントから使う読み取りクエリ。
// ダッシュボード（サマリー）とシフト画面で同じデータを使うため、ここに集約する。

export type PublishedRole = {
  role: string;
  date: string;
  start_time: string;
  end_time: string;
  slot_type: 'day' | 'training';
};

type JoinedSlot = {
  id?: string;
  date: string;
  start_time: string;
  end_time: string;
  slot_type: 'day' | 'training';
  assignment_status?: string;
  deadline?: string;
};

// 埋め込み join の戻りは配列にも単体にもなり得るため、ここで吸収する。
function one<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * 自分に割り振られた役割のうち、公開済み（published）のもの。
 * 未来のシフトが先頭、過ぎたものは末尾。
 */
export async function fetchMyPublishedRoles(userId: string): Promise<PublishedRole[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('shift_assignments')
    .select(
      'role, shift_slots(date, start_time, end_time, slot_type, assignment_status)'
    )
    .eq('user_id', userId);

  return (data ?? [])
    .map((r) => {
      const slot = one<JoinedSlot>(r.shift_slots as JoinedSlot | JoinedSlot[] | null);
      if (!slot || slot.assignment_status !== 'published') return null;
      return {
        role: r.role as string,
        date: slot.date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        slot_type: slot.slot_type,
      };
    })
    .filter((r): r is PublishedRole => r !== null)
    .sort((a, b) => compareSlotsUpcomingFirst(a, b));
}

export type PendingSlot = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  slot_type: 'day' | 'training';
  deadline: string;
};

/**
 * 自分が対象で、まだ希望を出していない期限内のシフト枠。期限が近い順。
 * 期限切れは（もう提出できないので）除く。
 */
export async function fetchMyPendingSlots(userId: string): Promise<PendingSlot[]> {
  const supabase = getSupabaseAdmin();
  const { data: targets } = await supabase
    .from('shift_target_users')
    .select('shift_slot_id')
    .eq('user_id', userId);
  const slotIds = (targets ?? []).map((t) => t.shift_slot_id as string);
  if (slotIds.length === 0) return [];

  const [{ data: slots }, { data: subs }] = await Promise.all([
    supabase
      .from('shift_slots')
      .select('id, date, start_time, end_time, slot_type, deadline')
      .in('id', slotIds),
    supabase
      .from('shift_submissions')
      .select('shift_slot_id')
      .eq('user_id', userId)
      .in('shift_slot_id', slotIds),
  ]);

  const submitted = new Set((subs ?? []).map((s) => s.shift_slot_id as string));
  return (slots ?? [])
    .filter((s) => !submitted.has(s.id) && !isExpired(s.deadline))
    .sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0))
    .map((s) => ({
      id: s.id,
      date: s.date,
      start_time: s.start_time,
      end_time: s.end_time,
      slot_type: s.slot_type,
      deadline: s.deadline,
    }));
}

/**
 * 次に出勤するシフト（公開済みの割り当てのうち、今日以降で一番近いもの）。
 */
export function nextRole(roles: PublishedRole[]): PublishedRole | null {
  const today = todayJst();
  return roles.find((r) => r.date >= today) ?? null;
}

export type SurveySummary = {
  id: string;
  date: string;
  title: string;
};

/**
 * 自分に見える公開済みアンケート結果を新しい順に。
 */
export async function fetchVisibleSurveys(
  userId: string,
  limit: number
): Promise<SurveySummary[]> {
  const supabase = getSupabaseAdmin();
  const scopes = await visibleScopes(userId);
  const { data } = await supabase
    .from('surveys')
    .select('id, date, title')
    .eq('status', 'published')
    .in('scope', scopes)
    .order('date', { ascending: false })
    .limit(limit);
  return (data ?? []) as SurveySummary[];
}
