import bcrypt from 'bcryptjs';
import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { generateTempPassword } from '@/lib/password';
import {
  jsonError,
  jsonOk,
  verifyOrigin,
  forbiddenOrigin,
  withRoute,
  isUuid,
  notFound,
} from '@/lib/http';

type Params = { params: Promise<{ id: string }> };

// POST: 管理者が対象メンバーのパスワードを一時パスワードにリセットする。
// 生成した平文は「この応答で1回だけ」返す（DB にはハッシュのみ保存・ログ出力しない）。
// 併せてログアウト状態にできるようロックカウンタも解除する。
async function postHandler(_req: Request, { params }: Params) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const id = (await params).id;
  if (!isUuid(id)) return notFound('ユーザーが見つかりません');

  const supabase = getSupabaseAdmin();

  // 対象の存在確認（脱退済みでも復帰時に使えるようリセットは許可する）
  const { data: user, error: findErr } = await supabase
    .from('users')
    .select('id, name, token_version')
    .eq('id', id)
    .maybeSingle();
  if (findErr) return jsonError('処理に失敗しました', 500, 'UPDATE_FAILED');
  if (!user) return jsonError('ユーザーが見つかりません', 404, 'NOT_FOUND');

  const tempPassword = generateTempPassword();
  const password_hash = await bcrypt.hash(tempPassword, 12);

  const { error } = await supabase
    .from('users')
    .update({
      password_hash,
      failed_login_attempts: 0,
      locked_until: null,
      // token_version を +1 して既存セッションを全て失効させる（乗っ取り対策）
      token_version: (user.token_version ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return jsonError('処理に失敗しました', 500, 'UPDATE_FAILED');

  // tempPassword はこの1回だけ返す。以降は取得不可（本人が変更するまでの一時値）。
  return jsonOk({ name: user.name, tempPassword });
}

export const POST = withRoute(postHandler);
