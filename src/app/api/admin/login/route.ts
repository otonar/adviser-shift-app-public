import { signAdminToken, setAdminCookie, LOCK_MINUTES, MAX_LOGIN_ATTEMPTS } from '@/lib/auth';
import {
  verifyAdminPassword,
  getAdminLockState,
  recordAdminFailure,
  resetAdminAttempts,
} from '@/lib/admin-auth';
import { adminLoginSchema } from '@/lib/validators';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

async function postHandler(req: Request) {
  if (!verifyOrigin()) return forbiddenOrigin();

  const parsed = await parseBody(req, adminLoginSchema);
  if (!parsed.ok) return parsed.response;
  const { password } = parsed.data;

  // レート制限: ロック中なら 429
  const lock = await getAdminLockState();
  if (lock.locked) {
    return jsonError(
      `試行回数が上限に達しました。約${Math.ceil(lock.remainingSec / 60)}分後に再試行してください`,
      429,
      'ADMIN_LOCKED'
    );
  }

  const valid = await verifyAdminPassword(password);
  if (!valid) {
    const attempts = await recordAdminFailure();
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      return jsonError(
        `試行回数が上限に達しました。${LOCK_MINUTES}分後に再試行してください`,
        429,
        'ADMIN_LOCKED'
      );
    }
    const remaining = MAX_LOGIN_ATTEMPTS - attempts;
    return jsonError(
      `パスワードが正しくありません（あと${remaining}回でロックされます）`,
      401,
      'INVALID_CREDENTIALS'
    );
  }

  await resetAdminAttempts();
  setAdminCookie(signAdminToken());
  return jsonOk({ ok: true });
}

export const POST = withRoute(postHandler);
