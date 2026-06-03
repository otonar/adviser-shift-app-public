import bcrypt from 'bcryptjs';
import { getSupabaseAdmin } from '@/lib/supabase';
import { signUserToken, setUserCookie } from '@/lib/auth';
import { optionalEnv } from '@/lib/env';
import { signupSchema } from '@/lib/validators';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

async function postHandler(req: Request) {
  if (!(await verifyOrigin())) return forbiddenOrigin();

  const parsed = await parseBody(req, signupSchema);
  if (!parsed.ok) return parsed.response;
  const { name, password, inviteCode } = parsed.data;

  // 招待コードによる登録ゲート。SIGNUP_INVITE_CODE が設定されているときのみ照合。
  // 未設定なら従来どおり誰でも登録可（公開運用するなら設定を推奨）。
  // コード照合は重複チェックより前に行い、未認可の名前列挙も防ぐ。
  const requiredInvite = optionalEnv('SIGNUP_INVITE_CODE');
  if (requiredInvite && inviteCode !== requiredInvite) {
    return jsonError('招待コードが正しくありません', 403, 'INVALID_INVITE');
  }

  const supabase = getSupabaseAdmin();

  // 名前の重複チェック
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('name', name)
    .maybeSingle();
  if (existing) {
    return jsonError('この名前は既に使われています', 409, 'NAME_TAKEN');
  }

  const password_hash = await bcrypt.hash(password, 12);

  const { data: user, error } = await supabase
    .from('users')
    .insert({ name, password_hash })
    .select('id, name')
    .single();

  if (error || !user) {
    return jsonError('登録に失敗しました', 500, 'SIGNUP_FAILED');
  }

  const token = signUserToken({ userId: user.id, name: user.name });
  await setUserCookie(token);

  return jsonOk({ user: { id: user.id, name: user.name } }, 201);
}

export const POST = withRoute(postHandler);
