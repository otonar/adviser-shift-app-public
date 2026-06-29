import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { jsonError, jsonOk, verifyOrigin, forbiddenOrigin, withRoute, isUuid, notFound } from '@/lib/http';

type Params = { params: Promise<{ shiftId: string }> };

// POST: やり直し（管理者）。割り振りを全削除し status を 'open' に戻す。
async function postHandler(_req: Request, { params }: Params) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const slotId = (await params).shiftId;
  if (!isUuid(slotId)) return notFound('シフト枠が見つかりません');

  const supabase = getSupabaseAdmin();

  const { error: delError } = await supabase
    .from('shift_assignments')
    .delete()
    .eq('shift_slot_id', slotId);
  if (delError) return jsonError('やり直しに失敗しました', 500, 'RESET_FAILED');

  const { error } = await supabase
    .from('shift_slots')
    .update({ assignment_status: 'open', updated_at: new Date().toISOString() })
    .eq('id', slotId);
  if (error) return jsonError('やり直しに失敗しました', 500, 'RESET_FAILED');

  return jsonOk({ ok: true });
}

export const POST = withRoute(postHandler);
