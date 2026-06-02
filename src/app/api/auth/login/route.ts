import bcrypt from 'bcryptjs';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  signUserToken,
  setUserCookie,
  MAX_LOGIN_ATTEMPTS,
  LOCK_MINUTES,
} from '@/lib/auth';
import { loginSchema } from '@/lib/validators';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

async function postHandler(req: Request) {
  if (!verifyOrigin()) return forbiddenOrigin();

  const parsed = await parseBody(req, loginSchema);
  if (!parsed.ok) return parsed.response;
  const { name, password } = parsed.data;

  const supabase = getSupabaseAdmin();

  const { data: user } = await supabase
    .from('users')
    .select(
      'id, name, password_hash, is_active, failed_login_attempts, locked_until'
    )
    .eq('name', name)
    .maybeSingle();

  // ユーザー列挙を避けるため、存在しない／脱退済みでも汎用メッセージで返す
  if (!user || !user.is_active) {
    return jsonError('名前またはパスワードが正しくありません', 401, 'INVALID_CREDENTIALS');
  }

  // レート制限: ロック中なら 429（残り時間を返す）
  if (user.locked_until) {
    const remainingMs = new Date(user.locked_until).getTime() - Date.now();
    if (remainingMs > 0) {
      return jsonError(
        `試行回数が上限に達しました。約${Math.ceil(remainingMs / 60000)}分後に再試行してください`,
        429,
        'ACCOUNT_LOCKED'
      );
    }
  }

  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    const attempts = (user.failed_login_attempts ?? 0) + 1;
    const locked_until =
      attempts >= MAX_LOGIN_ATTEMPTS
        ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
        : null;
    await supabase
      .from('users')
      .update({
        failed_login_attempts: attempts,
        locked_until,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (locked_until) {
      return jsonError(
        `試行回数が上限に達しました。${LOCK_MINUTES}分後に再試行してください`,
        429,
        'ACCOUNT_LOCKED'
      );
    }
    return jsonError('名前またはパスワードが正しくありません', 401, 'INVALID_CREDENTIALS');
  }

  // 成功: カウンタリセット
  await supabase
    .from('users')
    .update({
      failed_login_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  const token = signUserToken({ userId: user.id, name: user.name });
  setUserCookie(token);

  return jsonOk({ user: { id: user.id, name: user.name } });
}

export const POST = withRoute(postHandler);
