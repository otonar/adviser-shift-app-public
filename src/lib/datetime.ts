// 日付・時刻ユーティリティ。タイムゾーンはすべて JST (Asia/Tokyo) で統一。
// 日付比較は常にサーバーサイドで行い、クライアントのタイムゾーン依存を避ける。

const JST_OFFSET = '+09:00';

// 提出期限の既定値（枠の日付の何日前か）。管理画面で枠ごとに変えられる。
export const DEFAULT_DEADLINE_DAYS = 14;
// 「何日前」に指定できる上限。
export const MAX_DEADLINE_DAYS = 365;

/**
 * 'YYYY-MM-DD' に日数を足す（負の数で引く）。
 */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  // UTC 基準で日付演算（DST のない JST なので単純な日数の足し引きで安全）
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * 'YYYY-MM-DD' どうしの日数差（to − from）。
 */
export function daysBetween(from: string, to: string): number {
  const ms = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / (24 * 60 * 60 * 1000));
}

/**
 * 実在する日付か（'2026-02-31' のような形式だけ合っている値を弾く）。
 */
export function isRealDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && addDays(date, 0) === date;
}

/**
 * 期限日から提出期限を作る。期限は常にその日の 23:59:59 JST。
 * @param deadlineDate 'YYYY-MM-DD'
 * @returns ISO 8601 文字列（JST オフセット付き）
 */
export function deadlineFromDate(deadlineDate: string): string {
  return `${deadlineDate}T23:59:59${JST_OFFSET}`;
}

/**
 * シフト枠の提出期限を計算する。
 * deadline = (date の daysBefore 日前) の 23:59:59 JST。既定は 14 日前。
 * @param date 'YYYY-MM-DD'
 * @returns ISO 8601 文字列（JST オフセット付き）
 */
export function computeDeadline(
  date: string,
  daysBefore: number = DEFAULT_DEADLINE_DAYS
): string {
  return deadlineFromDate(addDays(date, -daysBefore));
}

/**
 * 提出期限（ISO 文字列）が JST で何日にあたるか 'YYYY-MM-DD'。
 */
export function deadlineDateJst(deadline: string): string {
  // UTC 時刻に +9h して JST の暦日を取り出す
  return new Date(new Date(deadline).getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * 提出期限を JST で「M/D(曜) HH:MM」に整形する（スタッフ向けの表示用）。
 */
export function formatDeadlineJst(deadline: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(deadline));
}

/**
 * 期限切れかどうか（サーバー現在時刻基準）。
 */
export function isExpired(deadline: string): boolean {
  return new Date(deadline).getTime() < Date.now();
}

/**
 * JST における今日の日付 'YYYY-MM-DD'。
 */
export function todayJst(): string {
  // UTC 時刻に +9h して JST の暦日を取り出す（DST のない JST なので単純加算で安全）。
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const yy = jst.getUTCFullYear();
  const mm = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(jst.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// 在庫数が「古い情報」とみなされるまでの時間（ミリ秒）。これを超えると注意表示を出す。
export const STOCK_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * 在庫の更新日時を表示用に整形する。
 * 絶対時刻（JST）＋相対表現（「3時間前」など）を返し、古い場合は stale=true。
 * クライアントの描画時に呼ぶ前提（相対表現は閲覧時点基準）。
 * @param iso stock_updated_at の ISO 文字列（null なら不明扱い）
 */
export function formatStockFreshness(iso: string | null | undefined): {
  text: string;
  relative: string;
  stale: boolean;
} {
  if (!iso) return { text: '更新日時 不明', relative: '不明', stale: true };
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const stale = diff >= STOCK_STALE_THRESHOLD_MS;
  const abs = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
  const relative = relativeTimeJa(diff);
  return { text: `${abs}（${relative}）`, relative, stale };
}

// 経過ミリ秒を「たった今 / N分前 / N時間前 / N日前」に変換する（未来は「まもなく」）。
function relativeTimeJa(diffMs: number): string {
  if (diffMs < 0) return 'まもなく';
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'たった今';
  if (min < 60) return `${min}分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;
  const day = Math.floor(hour / 24);
  return `${day}日前`;
}

/**
 * シフト並べ替え用の比較関数。
 * 1次: 今日以降（未来）のシフトを上に、過ぎたシフト（today より前）を下に。
 * 2次: 同グループ内は日付の古い順、同日内は開始時刻の早い順。
 * → 「次のシフト」が一番上、過ぎたシフトは末尾にまとまる。
 */
export function compareSlotsUpcomingFirst(
  a: { date: string; start_time: string },
  b: { date: string; start_time: string },
  today: string = todayJst()
): number {
  const aPast = a.date < today;
  const bPast = b.date < today;
  if (aPast !== bPast) return aPast ? 1 : -1; // 過ぎたシフトは後ろへ
  if (a.date !== b.date) return a.date < b.date ? -1 : 1; // 日付の古い順
  // 同じ日付内は開始時刻の早い順
  return a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0;
}
