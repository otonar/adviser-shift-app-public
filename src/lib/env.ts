// 環境変数アクセスの一元化。
// 実際の値はコードに書かず、必ず process.env から参照する。
// 未設定時はサーバーログに汎用メッセージのみ残し、値は決して出力しない。

/**
 * 必須の環境変数を取得する。未設定なら例外を投げる。
 * サーバーサイドでのみ使用すること。
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    // 値そのものは絶対に出力しない。キー名のみ。
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * 任意の環境変数を取得する。未設定なら undefined。
 */
export function optionalEnv(key: string): string | undefined {
  return process.env[key] || undefined;
}

/**
 * セッション有効期限（日数）。未設定時は 14 日。
 */
export function getSessionMaxAgeDays(): number {
  const raw = process.env.SESSION_MAX_AGE_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
}
