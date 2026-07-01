import bcrypt from 'bcryptjs';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  signUserToken,
  setUserCookie,
  MAX_LOGIN_ATTEMPTS,
  LOCK_MINUTES,
  ATTEMPT_WINDOW_MINUTES,
} from '@/lib/auth';
import { loginSchema } from '@/lib/validators';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

// ユーザー列挙のタイミング側チャネル対策用のダミーハッシュ。
// 該当ユーザーが存在しない/非アクティブでも bcrypt 比較を行い、
// 応答時間からユーザーの存在を推測されないようにする（値は実パスワードではない）。
const DUMMY_HASH = '$2a$12$vG/sXb0eYkSi6WPo44W9f.pNjfr9IPg.wz2WG47PBse5.NsMENz8e';

async function postHandler(req: Request) {
  if (!(await verifyOrigin())) return forbiddenOrigin();

  const parsed = await parseBody(req, loginSchema);
  if (!parsed.ok) return parsed.response;
  const { name, password } = parsed.data;

  const supabase = getSupabaseAdmin();

  const { data: user } = await supabase
    .from('users')
    .select('id, name, password_hash, is_active, locked_until, token_version')
    .eq('name', name)
    .maybeSingle();

  // ユーザー列挙を避けるため、存在しない／脱退済みでも汎用メッセージで返す。
  // さらに応答時間を揃えるためダミーハッシュで比較してから返す（タイミング側チャネル対策）。
  if (!user || !user.is_active) {
    await bcrypt.compare(password, DUMMY_HASH);
    return jsonError('名前またはパスワードが正しくありません', 401, 'INVALID_CREDENTIALS');
  }

  // レート制限: ロック中なら 429（残り時間を返す）。
  // 期限切れの場合はそのまま通し、失敗記録 RPC 側で 0 起点にリセットされる。
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
    // 失敗カウンタの加算は DB 関数で行い、対象行を FOR UPDATE でロックして
    // 再計算 → 更新することで並列失敗による過少カウント（TOCTOU）を防ぐ。
    // stale ウィンドウ・ロック期限切れリセットの判定も関数内で行う。
    const { data: result, error } = await supabase
      .rpc('record_user_login_failure', {
        p_user_id: user.id,
        p_max_attempts: MAX_LOGIN_ATTEMPTS,
        p_lock_minutes: LOCK_MINUTES,
        p_window_minutes: ATTEMPT_WINDOW_MINUTES,
      })
      .maybeSingle<{ out_attempts: number; out_locked_until: string | null }>();

    if (error || !result) {
      // 失敗記録に失敗した場合は内部エラー扱い（withRoute が 500 化・詳細は漏らさない）
      throw new Error('failed to record user login failure');
    }

    if (result.out_locked_until) {
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

  const token = signUserToken({
    userId: user.id,
    name: user.name,
    tokenVersion: user.token_version ?? 0,
  });
  await setUserCookie(token);

  return jsonOk({ user: { id: user.id, name: user.name } });
}

export const POST = withRoute(postHandler);
