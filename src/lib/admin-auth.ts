import 'server-only';
import bcrypt from 'bcryptjs';
import { getSupabaseAdmin } from './supabase';
import { requireEnv } from './env';
import { MAX_LOGIN_ATTEMPTS, LOCK_MINUTES } from './auth';

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
 */
export async function recordAdminFailure(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('admin_login_attempts')
    .select('failed_attempts')
    .eq('identifier', ADMIN_IDENTIFIER)
    .maybeSingle();

  const attempts = (data?.failed_attempts ?? 0) + 1;
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
