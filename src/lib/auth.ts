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

export function signUserToken(payload: { userId: string; name: string }): string {
  return jwt.sign(payload, secret(), { expiresIn: `${getSessionMaxAgeDays()}d` });
}

export function signAdminToken(): string {
  return jwt.sign({ role: 'admin' }, secret(), {
    expiresIn: `${getSessionMaxAgeDays()}d`,
  });
}

export function verifyUserToken(token: string): UserJwtPayload | null {
  try {
    const decoded = jwt.verify(token, secret());
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
    const decoded = jwt.verify(token, secret());
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

export function setUserCookie(token: string) {
  cookies().set(USER_COOKIE, token, { ...baseCookieOptions(), maxAge: maxAgeSeconds() });
}

export function clearUserCookie() {
  cookies().set(USER_COOKIE, '', { ...baseCookieOptions(), maxAge: 0 });
}

export function getUserCookie(): string | undefined {
  return cookies().get(USER_COOKIE)?.value;
}

export function setAdminCookie(token: string) {
  cookies().set(ADMIN_COOKIE, token, { ...baseCookieOptions(), maxAge: maxAgeSeconds() });
}

export function clearAdminCookie() {
  cookies().set(ADMIN_COOKIE, '', { ...baseCookieOptions(), maxAge: 0 });
}

export function getAdminCookie(): string | undefined {
  return cookies().get(ADMIN_COOKIE)?.value;
}
