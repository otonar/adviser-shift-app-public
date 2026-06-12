// 日付・時刻ユーティリティ。タイムゾーンはすべて JST (Asia/Tokyo) で統一。
// 日付比較は常にサーバーサイドで行い、クライアントのタイムゾーン依存を避ける。

const JST_OFFSET = '+09:00';

/**
 * シフト枠の提出期限を計算する。
 * deadline = (date の 14 日前) の 23:59:59 JST
 * @param date 'YYYY-MM-DD'
 * @returns ISO 8601 文字列（JST オフセット付き）
 */
export function computeDeadline(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  // UTC 基準で日付演算（DST のない JST なので単純な日数引き算で安全）
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() - 14);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}T23:59:59${JST_OFFSET}`;
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
