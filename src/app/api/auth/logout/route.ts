import { clearUserCookie } from '@/lib/auth';
import { jsonOk, verifyOrigin, forbiddenOrigin } from '@/lib/http';

export async function POST() {
  if (!verifyOrigin()) return forbiddenOrigin();
  clearUserCookie();
  return jsonOk({ ok: true });
}
