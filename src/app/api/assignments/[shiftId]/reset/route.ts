import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { jsonError, jsonOk, verifyOrigin, forbiddenOrigin } from '@/lib/http';

type Params = { params: { shiftId: string } };

// POST: やり直し（管理者）。割り振りを全削除し status を 'open' に戻す。
export async function POST(_req: Request, { params }: Params) {
  if (!verifyOrigin()) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const supabase = getSupabaseAdmin();
  const slotId = params.shiftId;

  await supabase
    .from('shift_assignments')
    .delete()
    .eq('shift_slot_id', slotId);

  const { error } = await supabase
    .from('shift_slots')
    .update({ assignment_status: 'open', updated_at: new Date().toISOString() })
    .eq('id', slotId);
  if (error) return jsonError('やり直しに失敗しました', 500, 'RESET_FAILED');

  return jsonOk({ ok: true });
}
