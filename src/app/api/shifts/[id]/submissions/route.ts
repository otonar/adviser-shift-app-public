import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateUser } from '@/lib/middleware';
import { submissionSchema } from '@/lib/validators';
import { isExpired } from '@/lib/datetime';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

type Params = { params: { id: string } };

// POST: シフト希望の提出・更新（一般スタッフ）。
async function postHandler(req: Request, { params }: Params) {
  if (!verifyOrigin()) return forbiddenOrigin();
  const auth = await authenticateUser();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, submissionSchema);
  if (!parsed.ok) return parsed.response;
  const { available, note } = parsed.data;

  const supabase = getSupabaseAdmin();
  const slotId = params.id;

  // 対象スタッフかどうか
  const { data: target } = await supabase
    .from('shift_target_users')
    .select('user_id')
    .eq('shift_slot_id', slotId)
    .eq('user_id', auth.userId)
    .maybeSingle();
  if (!target) {
    return jsonError('このシフトの対象ではありません', 403, 'NOT_TARGET');
  }

  // 期限チェック
  const { data: slot } = await supabase
    .from('shift_slots')
    .select('deadline')
    .eq('id', slotId)
    .maybeSingle();
  if (!slot) return jsonError('シフト枠が見つかりません', 404, 'NOT_FOUND');
  if (isExpired(slot.deadline)) {
    return jsonError('提出期限が過ぎています', 400, 'DEADLINE_PASSED');
  }

  // UPSERT（user_id + shift_slot_id）
  const { error } = await supabase.from('shift_submissions').upsert(
    {
      user_id: auth.userId,
      shift_slot_id: slotId,
      available,
      note: note ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,shift_slot_id' }
  );
  if (error) return jsonError('提出に失敗しました', 500, 'SUBMIT_FAILED');

  return jsonOk({ ok: true });
}

export const POST = withRoute(postHandler);
