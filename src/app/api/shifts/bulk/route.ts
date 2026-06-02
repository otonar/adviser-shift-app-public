import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { createShiftsBulkSchema } from '@/lib/validators';
import { rolesForSlotType } from '@/lib/role-assignment';
import { computeDeadline } from '@/lib/datetime';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

// POST: 複数日のシフト枠をまとめて作成（管理者）。
// slot_type・時間・備考・対象者は共通、日付だけ複数。各枠に役割（初期0）を初期化。
async function postHandler(req: Request) {
  if (!verifyOrigin()) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const parsed = await parseBody(req, createShiftsBulkSchema);
  if (!parsed.ok) return parsed.response;
  const { slot_type, dates, start_time, end_time, note, target_user_ids } =
    parsed.data;

  const supabase = getSupabaseAdmin();
  const uniqueDates = [...new Set(dates)];

  // 枠を一括作成
  const slotRows = uniqueDates.map((date) => ({
    slot_type,
    date,
    start_time,
    end_time,
    deadline: computeDeadline(date),
    note: note ?? null,
  }));
  const { data: createdSlots, error } = await supabase
    .from('shift_slots')
    .insert(slotRows)
    .select('id');
  if (error || !createdSlots) {
    return jsonError('シフト枠の作成に失敗しました', 500, 'CREATE_FAILED');
  }
  const slotIds = createdSlots.map((s) => s.id);

  // 対象スタッフ（全枠ぶん）
  const targetIds = target_user_ids ?? [];
  if (targetIds.length > 0) {
    const targetRows = slotIds.flatMap((shift_slot_id) =>
      targetIds.map((user_id) => ({ shift_slot_id, user_id }))
    );
    await supabase.from('shift_target_users').insert(targetRows);
  }

  // 役割別必要人数（初期値 0、全枠ぶん）
  const roles = rolesForSlotType(slot_type);
  const reqRows = slotIds.flatMap((shift_slot_id) =>
    roles.map((role) => ({ shift_slot_id, role, required_count: 0 }))
  );
  await supabase.from('shift_role_requirements').insert(reqRows);

  return jsonOk({ created: slotIds.length }, 201);
}

export const POST = withRoute(postHandler);
