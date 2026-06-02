import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateUser } from '@/lib/middleware';
import { bulkSubmissionSchema } from '@/lib/validators';
import { isExpired } from '@/lib/datetime';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

// POST: 複数枠の希望をまとめて提出・更新（一般スタッフ）。
// 対象外の枠・期限切れの枠はスキップし、保存件数とスキップ件数を返す。
// note は送らない（既存の備考を保持。備考は1件ずつのカードUIで編集）。
async function postHandler(req: Request) {
  if (!verifyOrigin()) return forbiddenOrigin();
  const auth = await authenticateUser();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, bulkSubmissionSchema);
  if (!parsed.ok) return parsed.response;
  const { items } = parsed.data;

  const supabase = getSupabaseAdmin();
  const ids = [...new Set(items.map((i) => i.shift_slot_id))];

  // 自分が対象の枠
  const { data: targets } = await supabase
    .from('shift_target_users')
    .select('shift_slot_id')
    .eq('user_id', auth.userId)
    .in('shift_slot_id', ids);
  const targetSet = new Set((targets ?? []).map((t) => t.shift_slot_id));

  // 期限
  const { data: slots } = await supabase
    .from('shift_slots')
    .select('id, deadline')
    .in('id', ids);
  const deadlineById = new Map((slots ?? []).map((s) => [s.id, s.deadline]));

  const now = new Date().toISOString();
  const rows: {
    user_id: string;
    shift_slot_id: string;
    available: boolean;
    updated_at: string;
  }[] = [];
  let skipped = 0;
  for (const it of items) {
    const deadline = deadlineById.get(it.shift_slot_id);
    if (!targetSet.has(it.shift_slot_id) || !deadline || isExpired(deadline)) {
      skipped++;
      continue;
    }
    rows.push({
      user_id: auth.userId,
      shift_slot_id: it.shift_slot_id,
      available: it.available,
      updated_at: now,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from('shift_submissions')
      .upsert(rows, { onConflict: 'user_id,shift_slot_id' });
    if (error) return jsonError('保存に失敗しました', 500, 'BULK_SUBMIT_FAILED');
  }

  return jsonOk({ saved: rows.length, skipped });
}

export const POST = withRoute(postHandler);
