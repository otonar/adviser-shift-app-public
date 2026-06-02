import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateUser, authenticateAdmin } from '@/lib/middleware';
import { createShiftSchema } from '@/lib/validators';
import { rolesForSlotType } from '@/lib/role-assignment';
import { computeDeadline, isExpired } from '@/lib/datetime';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

// GET: 一覧。管理者は全枠、一般ユーザーは自分が対象の枠＋自分の提出状況を返す。
// ?scope=mine のときは管理 Cookie があってもスタッフ視点（自分の提出状況つき）を返す。
// （管理とスタッフは別 Cookie で同時ログインでき、既定だと管理ビューが優先されてしまうため）
async function getHandler(req: Request) {
  const scope = new URL(req.url).searchParams.get('scope');

  // 認証を先に行う（未認証時に DB クライアント生成で例外を出さないため）
  if (scope !== 'mine') {
    const admin = await authenticateAdmin();
    if (admin.ok) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('shift_slots')
        .select('*')
        .order('date', { ascending: true });
      if (error) return jsonError('取得に失敗しました', 500, 'FETCH_FAILED');
      return jsonOk({ slots: data ?? [] });
    }
  }

  const user = await authenticateUser();
  if (!user.ok) return user.response;

  const supabase = getSupabaseAdmin();
  // 自分が対象のシフト枠のみ
  const { data: targets } = await supabase
    .from('shift_target_users')
    .select('shift_slot_id')
    .eq('user_id', user.userId);
  const slotIds = (targets ?? []).map((t) => t.shift_slot_id);
  if (slotIds.length === 0) return jsonOk({ slots: [] });

  const { data: slots, error } = await supabase
    .from('shift_slots')
    .select('*')
    .in('id', slotIds)
    .order('date', { ascending: true });
  if (error) return jsonError('取得に失敗しました', 500, 'FETCH_FAILED');

  const { data: subs } = await supabase
    .from('shift_submissions')
    .select('shift_slot_id, available, note')
    .eq('user_id', user.userId)
    .in('shift_slot_id', slotIds);
  const subBySlot = new Map(
    (subs ?? []).map((s) => [s.shift_slot_id, s])
  );

  const result = (slots ?? []).map((slot) => {
    const sub = subBySlot.get(slot.id);
    return {
      ...slot,
      expired: isExpired(slot.deadline),
      submission: sub
        ? { available: sub.available, note: sub.note }
        : null,
    };
  });

  return jsonOk({ slots: result });
}

// POST: シフト枠作成（管理者）。
async function postHandler(req: Request) {
  if (!verifyOrigin()) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const parsed = await parseBody(req, createShiftSchema);
  if (!parsed.ok) return parsed.response;
  const { slot_type, date, start_time, end_time, note, target_user_ids } =
    parsed.data;

  const supabase = getSupabaseAdmin();
  const deadline = computeDeadline(date);

  const { data: slot, error } = await supabase
    .from('shift_slots')
    .insert({ slot_type, date, start_time, end_time, deadline, note: note ?? null })
    .select('*')
    .single();
  if (error || !slot) {
    return jsonError('シフト枠の作成に失敗しました', 500, 'CREATE_FAILED');
  }

  // 対象スタッフ
  const targetIds = target_user_ids ?? [];
  if (targetIds.length > 0) {
    const rows = targetIds.map((user_id) => ({
      shift_slot_id: slot.id,
      user_id,
    }));
    await supabase.from('shift_target_users').insert(rows);
  }

  // 役割別必要人数（初期値 0）
  const reqRows = rolesForSlotType(slot_type).map((role) => ({
    shift_slot_id: slot.id,
    role,
    required_count: 0,
  }));
  await supabase.from('shift_role_requirements').insert(reqRows);

  return jsonOk({ slot }, 201);
}

export const GET = withRoute(getHandler);
export const POST = withRoute(postHandler);
