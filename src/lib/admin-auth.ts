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
 *
 * カウンタ加算は DB 関数 record_admin_login_failure で行い、対象行を
 * FOR UPDATE でロックして再計算 → 更新することで並列失敗による過少カウント
 * （TOCTOU）を防ぐ。stale ウィンドウ・ロック期限切れリセットの判定も関数内。
 *
 * @returns 記録後の累積失敗回数（呼び出し側で残り回数の算出に使う）
 */
export async function recordAdminFailure(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .rpc('record_admin_login_failure', {
      p_identifier: ADMIN_IDENTIFIER,
      p_max_attempts: MAX_LOGIN_ATTEMPTS,
      p_lock_minutes: LOCK_MINUTES,
      p_window_minutes: ATTEMPT_WINDOW_MINUTES,
    })
    .maybeSingle<{ out_attempts: number; out_locked_until: string | null }>();

  if (error || !data) {
    // 失敗記録に失敗した場合は内部エラーとして扱う（呼び出し側 withRoute が 500 化）。
    // 実際の値は出力しない。
    throw new Error('failed to record admin login failure');
  }

  return data.out_attempts;
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
