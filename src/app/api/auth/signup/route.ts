import bcrypt from 'bcryptjs';
import { getSupabaseAdmin } from '@/lib/supabase';
import { signUserToken, setUserCookie } from '@/lib/auth';
import { signupSchema } from '@/lib/validators';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin } from '@/lib/http';

export async function POST(req: Request) {
  if (!verifyOrigin()) return forbiddenOrigin();

  const parsed = await parseBody(req, signupSchema);
  if (!parsed.ok) return parsed.response;
  const { name, password } = parsed.data;

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
  setUserCookie(token);

  return jsonOk({ user: { id: user.id, name: user.name } }, 201);
}
