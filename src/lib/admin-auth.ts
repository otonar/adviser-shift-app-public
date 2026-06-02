import 'server-only';
import bcrypt from 'bcryptjs';
import { getSupabaseAdmin } from './supabase';
import { requireEnv } from './env';
import { MAX_LOGIN_ATTEMPTS, LOCK_MINUTES, ATTEMPT_WINDOW_MINUTES } from './auth';

// 管理画面は共有パスワード方式。ADMIN_PASSWORD_HASH と bcrypt 比較する。
// レート制限カウンタはサーバーレスで揮発しないよう DB (admin_login_attempts) に保持。

const ADMIN_IDENTIFIER = 'admin';

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const hash = requireEnv('ADMIN_PASSWORD_HASH');
  return bcrypt.compare(password, hash);
}

type LockState = { locked: boolean; remainingSec: number };

/**
 * 管理ログインのロック状態を返す。行が無ければ作成する。
 */
export async function getAdminLockState(): Promise<LockState> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('admin_login_attempts')
    .select('locked_until')
    .eq('identifier', ADMIN_IDENTIFIER)
    .maybeSingle();

  if (!data) {
    await supabase
      .from('admin_login_attempts')
      .insert({ identifier: ADMIN_IDENTIFIER, failed_attempts: 0 });
    return { locked: false, remainingSec: 0 };
  }

  if (data.locked_until) {
    const remainingMs = new Date(data.locked_until).getTime() - Date.now();
    if (remainingMs > 0) {
      return { locked: true, remainingSec: Math.ceil(remainingMs / 1000) };
    }
    // ロック期限切れ: カウンタをリセットして 5 回の猶予を復活させる
    // （これをしないと、明けた直後の 1 回失敗で即再ロックになる）
    await resetAdminAttempts();
  }
  return { locked: false, remainingSec: 0 };
}

/**
 * ログイン失敗を記録。5回到達で 15 分ロック。
 * @returns 記録後の累積失敗回数（呼び出し側で残り回数の算出に使う）
 */
export async function recordAdminFailure(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('admin_login_attempts')
    .select('failed_attempts, updated_at')
    .eq('identifier', ADMIN_IDENTIFIER)
    .maybeSingle();

  // 最後の失敗から ATTEMPT_WINDOW_MINUTES 以上経っていれば、古い失敗は数えない
  const stale = data?.updated_at
    ? Date.now() - new Date(data.updated_at).getTime() >
      ATTEMPT_WINDOW_MINUTES * 60 * 1000
    : false;
  const prior = stale ? 0 : (data?.failed_attempts ?? 0);
  const attempts = prior + 1;
  const locked_until =
    attempts >= MAX_LOGIN_ATTEMPTS
      ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
      : null;

  await supabase
    .from('admin_login_attempts')
    .update({
      failed_attempts: attempts,
      locked_until,
      updated_at: new Date().toISOString(),
    })
    .eq('identifier', ADMIN_IDENTIFIER);

  return attempts;
}

export async function resetAdminAttempts(): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from('admin_login_attempts')
    .update({
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('identifier', ADMIN_IDENTIFIER);
}
