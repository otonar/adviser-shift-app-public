import 'server-only';
import { getSupabaseAdmin } from './supabase';
import { visibleScopes } from './scope';
import { compareSlotsUpcomingFirst, isExpired, todayJst } from './datetime';

// スタッフ画面のサーバーコンポーネントから使う読み取りクエリ。
// 同じデータを画面（サーバーコンポーネント）と API ルートの両方から使うため、ここに集約する。
//
// エラーの扱い: 取得に失敗したら throw する（呼び出し側で「失敗」と「0件」を区別できるように）。
// 画面側は try/catch で「読み込みに失敗しました」を出し、API ルートは 500 に変換する。
// ※ 先に書いた fetchMyPublishedRoles / fetchMyPendingSlots は空配列に倒す従来の作り。

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

export type VisibleProduct = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  stock: number;
  stock_updated_at: string | null;
  out_of_stock: boolean;
};

/**
 * スタッフに見せる商品一覧（非表示の商品は含まない）。名前順。
 * 在庫 0 は out_of_stock フラグを立てて返す（画面で「在庫なし」を出すため）。
 */
export async function fetchVisibleProducts(): Promise<VisibleProduct[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('products')
    .select('id, name, description, category, stock, stock_updated_at')
    .eq('is_visible', true)
    .order('name', { ascending: true });
  if (error) throw new Error('products の取得に失敗しました');
  return (data ?? []).map((p) => ({ ...p, out_of_stock: p.stock <= 0 }));
}

export type VisibleSuggestion = {
  id: string;
  category: string;
  type: string;
  show_name: boolean;
  scope: 'all' | 'core';
  content: string;
  status: 'open' | 'done';
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
  author_name: string | null;
  mine: boolean;
};

const SUGGESTION_COLUMNS =
  'id, category, type, show_name, scope, content, status, admin_reply, replied_at, created_at, user_id';

// 指定 user_id 群の表示名を一括取得して Map で返す（埋め込み join の関係型の曖昧さを避ける）。
async function fetchAuthorNames(
  userIds: (string | null)[]
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from('users').select('id, name').in('id', ids);
  for (const u of data ?? []) map.set(u.id, u.name);
  return map;
}

/**
 * 目安箱のうち、そのユーザーに見える投稿を新しい順に。
 *
 * 「閲覧範囲に入る投稿」＋「自分の投稿（範囲を問わず）」を返す。
 * 自分の投稿が自分に見えないと、出したのに消えたように見えて分かりにくいため。
 * OR 条件を文字列で組み立てず、2回引いて id で重複を除く（件数は小さい）。
 *
 * 名前は show_name=true の投稿ぶんだけ引く（非表示のものは名前を出さない）。
 * mine はリクエストごとに突き合わせて計算するので、他人の投稿が自分のものになることはない。
 */
export async function fetchVisibleSuggestions(
  userId: string
): Promise<VisibleSuggestion[]> {
  const supabase = getSupabaseAdmin();
  // コアメンバーなら 'core' 限定の投稿も閲覧できる
  const scopes = await visibleScopes(userId);

  const [{ data: inScope, error: scopeError }, { data: own, error: ownError }] =
    await Promise.all([
      supabase.from('suggestions').select(SUGGESTION_COLUMNS).in('scope', scopes),
      supabase.from('suggestions').select(SUGGESTION_COLUMNS).eq('user_id', userId),
    ]);
  if (scopeError || ownError) throw new Error('suggestions の取得に失敗しました');

  const byId = new Map<string, NonNullable<typeof inScope>[number]>();
  for (const r of [...(inScope ?? []), ...(own ?? [])]) byId.set(r.id, r);
  const rows = [...byId.values()].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
  );

  const names = await fetchAuthorNames(
    rows.filter((r) => r.show_name).map((r) => r.user_id)
  );
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    type: r.type,
    show_name: r.show_name,
    scope: r.scope,
    content: r.content,
    status: r.status,
    admin_reply: r.admin_reply,
    replied_at: r.replied_at,
    created_at: r.created_at,
    author_name: r.show_name ? (names.get(r.user_id) ?? null) : null,
    // 自分の投稿である印（名前非表示でも本人には分かるようにする）
    mine: r.user_id === userId,
  }));
}

export type SurveySummary = {
  id: string;
  date: string;
  title: string;
  note: string | null;
  respondent_count: number | null;
  status: string;
  scope: 'all' | 'core';
  published_at: string | null;
  created_at: string;
};

const SURVEY_COLUMNS =
  'id, date, title, note, respondent_count, status, scope, published_at, created_at';

/**
 * 自分に見える公開済みアンケート結果を新しい順に。
 * limit を省略すると全件（アンケート画面用）。
 */
export async function fetchVisibleSurveys(
  userId: string,
  limit?: number
): Promise<SurveySummary[]> {
  const supabase = getSupabaseAdmin();
  const scopes = await visibleScopes(userId);
  const query = supabase
    .from('surveys')
    .select(SURVEY_COLUMNS)
    .eq('status', 'published')
    .in('scope', scopes)
    .order('date', { ascending: false });
  const { data, error } = await (limit === undefined ? query : query.limit(limit));
  if (error) throw new Error('surveys の取得に失敗しました');
  return (data ?? []) as SurveySummary[];
}
