import { clearAdminCookie } from '@/lib/auth';
import { jsonOk, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

async function postHandler() {
  if (!verifyOrigin()) return forbiddenOrigin();
  clearAdminCookie();
  return jsonOk({ ok: true });
}

export const POST = withRoute(postHandler);
