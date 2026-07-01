import bcrypt from 'bcryptjs';
import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateUser } from '@/lib/middleware';
import { signUserToken, setUserCookie } from '@/lib/auth';
import { changePasswordSchema } from '@/lib/validators';
import {
  jsonError,
  jsonOk,
  parseBody,
  verifyOrigin,
  forbiddenOrigin,
  withRoute,
} from '@/lib/http';

// POST: 本人がパスワードを変更する。現在のパスワード確認を必須にする
// （セッションが盗まれても現行パスワードなしには変更できないようにする）。
async function postHandler(req: Request) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const auth = await authenticateUser();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, changePasswordSchema);
  if (!parsed.ok) return parsed.response;
  const { current_password, new_password } = parsed.data;

  const supabase = getSupabaseAdmin();
  const { data: user, error: findErr } = await supabase
    .from('users')
    .select('password_hash, token_version')
    .eq('id', auth.userId)
    .maybeSingle();
  if (findErr) return jsonError('処理に失敗しました', 500, 'UPDATE_FAILED');
  if (!user) return jsonError('ユーザーが見つかりません', 404, 'NOT_FOUND');

  const valid = await bcrypt.compare(current_password, user.password_hash);
  if (!valid) {
    return jsonError('現在のパスワードが正しくありません', 401, 'INVALID_CREDENTIALS');
  }

  // token_version を +1 して他端末の既存セッションを失効させる。
  const nextVersion = (user.token_version ?? 0) + 1;
  const password_hash = await bcrypt.hash(new_password, 12);
  const { error } = await supabase
    .from('users')
    .update({
      password_hash,
      token_version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq('id', auth.userId);
  if (error) return jsonError('更新に失敗しました', 500, 'UPDATE_FAILED');

  // 操作中の端末は新しい版のトークンを再発行してログイン継続にする
  // （失効するのは他端末だけ）。
  await setUserCookie(
    signUserToken({ userId: auth.userId, name: auth.name, tokenVersion: nextVersion })
  );

  return jsonOk({ ok: true });
}

export const POST = withRoute(postHandler);
