import 'server-only';
import {
  getUserCookie,
  getAdminCookie,
  verifyUserToken,
  verifyAdminToken,
} from './auth';
import { getSupabaseAdmin } from './supabase';
import { jsonError } from './http';

// Route Handler 内で呼ぶ認証ヘルパー（Node ランタイム）。
// Edge の Next.js middleware.ts ではない（jsonwebtoken/bcrypt が Edge で動かないため）。

export type UserAuth =
  | { ok: true; userId: string; name: string }
  | { ok: false; response: ReturnType<typeof jsonError> };

export type AdminAuth =
  | { ok: true }
  | { ok: false; response: ReturnType<typeof jsonError> };

function unauthorized() {
  return jsonError('認証が必要です', 401, 'UNAUTHORIZED');
}

/**
 * ユーザー認証。Cookie の JWT を検証し、DB で is_active を確認する。
 * 無効・期限切れ・脱退済みなら 401。
 */
export async function authenticateUser(): Promise<UserAuth> {
  try {
    const token = getUserCookie();
    if (!token) return { ok: false, response: unauthorized() };

    const payload = verifyUserToken(token);
    if (!payload) return { ok: false, response: unauthorized() };

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .select('is_active')
      .eq('id', payload.userId)
      .single();

    if (error || !data || !data.is_active) {
      return { ok: false, response: unauthorized() };
    }

    return { ok: true, userId: payload.userId, name: payload.name };
  } catch {
    // env 未設定・DB 接続不可などは未認証として扱う（fail closed）
    return { ok: false, response: unauthorized() };
  }
}

/**
 * 管理画面認証。admin_token Cookie を検証する。
 */
export async function authenticateAdmin(): Promise<AdminAuth> {
  try {
    const token = getAdminCookie();
    if (!token) return { ok: false, response: unauthorized() };

    const payload = verifyAdminToken(token);
    if (!payload) return { ok: false, response: unauthorized() };

    return { ok: true };
  } catch {
    return { ok: false, response: unauthorized() };
  }
}
