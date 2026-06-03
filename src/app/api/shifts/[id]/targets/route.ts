import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { updateTargetsSchema } from '@/lib/validators';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

type Params = { params: Promise<{ id: string }> };

// PUT: 対象スタッフを総入れ替え（管理者）。
async function putHandler(req: Request, { params }: Params) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const parsed = await parseBody(req, updateTargetsSchema);
  if (!parsed.ok) return parsed.response;
  const { user_ids } = parsed.data;

  const supabase = getSupabaseAdmin();
  const slotId = (await params).id;

  // 全削除 → 新規挿入
  const { error: delError } = await supabase
    .from('shift_target_users')
    .delete()
    .eq('shift_slot_id', slotId);
  if (delError) return jsonError('更新に失敗しました', 500, 'UPDATE_FAILED');

  if (user_ids.length > 0) {
    const rows = user_ids.map((user_id) => ({
      shift_slot_id: slotId,
      user_id,
    }));
    const { error: insError } = await supabase
      .from('shift_target_users')
      .insert(rows);
    if (insError) return jsonError('更新に失敗しました', 500, 'UPDATE_FAILED');
  }

  return jsonOk({ ok: true });
}

export const PUT = withRoute(putHandler);
