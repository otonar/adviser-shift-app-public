import { clearAdminCookie } from '@/lib/auth';
import { jsonOk, verifyOrigin, forbiddenOrigin } from '@/lib/http';

export async function POST() {
  if (!verifyOrigin()) return forbiddenOrigin();
  clearAdminCookie();
  return jsonOk({ ok: true });
}
