import 'server-only';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { requireEnv, getSessionMaxAgeDays } from './env';
import type { UserJwtPayload, AdminJwtPayload } from '@/types';

// JWT は httpOnly + Secure + SameSite=Lax Cookie に格納する。
// localStorage / sessionStorage には絶対に入れない。

export const USER_COOKIE = 'token';
export const ADMIN_COOKIE = 'admin_token';

// レート制限の共通定数
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
// 失敗カウントの有効期間。最後の失敗からこの時間が経過していれば
// カウントを 0 に戻す（古い失敗を引きずってロックしない）。
export const ATTEMPT_WINDOW_MINUTES = 15;

function secret(): string {
  return requireEnv('JWT_SECRET');
}

function maxAgeSeconds(): number {
  return getSessionMaxAgeDays() * 24 * 60 * 60;
}

function baseCookieOptions() {
  return {
    httpOnly: true,
    // 本番は HTTPS 必須。ローカル開発(http)では Secure を外さないと Cookie が保存されない。
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
}

// ===== トークン生成・検証 =====

// 署名・検証ともアルゴリズムを HS256 に固定する（多層防御: アルゴリズム
// 取り違え／'none' を明示的に排除する）。
const JWT_ALGORITHM = 'HS256' as const;

export function signUserToken(payload: {
  userId: string;
  name: string;
  tokenVersion: number;
}): string {
  return jwt.sign(
    { userId: payload.userId, name: payload.name, tv: payload.tokenVersion },
    secret(),
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: `${getSessionMaxAgeDays()}d`,
    }
  );
}

export function signAdminToken(): string {
  return jwt.sign({ role: 'admin' }, secret(), {
    algorithm: JWT_ALGORITHM,
    expiresIn: `${getSessionMaxAgeDays()}d`,
  });
}

export function verifyUserToken(token: string): UserJwtPayload | null {
  try {
    const decoded = jwt.verify(token, secret(), { algorithms: [JWT_ALGORITHM] });
    if (typeof decoded === 'object' && decoded && 'userId' in decoded) {
      return decoded as UserJwtPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export function verifyAdminToken(token: string): AdminJwtPayload | null {
  try {
    const decoded = jwt.verify(token, secret(), { algorithms: [JWT_ALGORITHM] });
    if (
      typeof decoded === 'object' &&
      decoded &&
      'role' in decoded &&
      (decoded as { role?: unknown }).role === 'admin'
    ) {
      return decoded as AdminJwtPayload;
    }
    return null;
  } catch {
    return null;
  }
}

// ===== Cookie 操作 =====

export async function setUserCookie(token: string) {
  (await cookies()).set(USER_COOKIE, token, { ...baseCookieOptions(), maxAge: maxAgeSeconds() });
}

export async function clearUserCookie() {
  (await cookies()).set(USER_COOKIE, '', { ...baseCookieOptions(), maxAge: 0 });
}

export async function getUserCookie(): Promise<string | undefined> {
  return (await cookies()).get(USER_COOKIE)?.value;
}

export async function setAdminCookie(token: string) {
  (await cookies()).set(ADMIN_COOKIE, token, { ...baseCookieOptions(), maxAge: maxAgeSeconds() });
}

export async function clearAdminCookie() {
  (await cookies()).set(ADMIN_COOKIE, '', { ...baseCookieOptions(), maxAge: 0 });
}

export async function getAdminCookie(): Promise<string | undefined> {
  return (await cookies()).get(ADMIN_COOKIE)?.value;
}
