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
