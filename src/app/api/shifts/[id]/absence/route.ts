import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateUser } from '@/lib/middleware';
import { absenceReportSchema } from '@/lib/validators';
import {
  absenceWindow,
  isAbsenceEligible,
  buildAbsenceMessage,
  buildAbsenceCancelMessage,
} from '@/lib/absence';
import { notifyCoreMembers } from '@/lib/absence-server';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute, isUuid, notFound } from '@/lib/http';

type Params = { params: Promise<{ id: string }> };

// 欠席連絡（提出期限後）。本人が出す・取り消す。
// 時間（期限後〜開始時刻前）と立場（○で提出／確定済みの割り振り）はここで検証する。

async function loadSlot(slotId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('shift_slots')
    .select('id, date, start_time, end_time, slot_type, title, deadline, assignment_status')
    .eq('id', slotId)
    .maybeSingle();
  return data;
}

function windowError(w: 'before_deadline' | 'started') {
  return w === 'before_deadline'
    ? jsonError('提出期限前です。シフト希望を「× 出られない」に変えてください', 400, 'BEFORE_DEADLINE')
    : jsonError('シフトの開始時刻を過ぎています。コアメンバーに直接連絡してください', 400, 'SHIFT_STARTED');
}

// POST: 欠席を連絡する。コアメンバー全員に LINE で知らせる。
async function postHandler(req: Request, { params }: Params) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const auth = await authenticateUser();
  if (!auth.ok) return auth.response;

  const slotId = (await params).id;
  if (!isUuid(slotId)) return notFound('シフト枠が見つかりません');

  const parsed = await parseBody(req, absenceReportSchema);
  if (!parsed.ok) return parsed.response;
  const { reason } = parsed.data;

  const slot = await loadSlot(slotId);
  if (!slot) return notFound('シフト枠が見つかりません');

  const w = absenceWindow(slot);
  if (w !== 'open') return windowError(w);

  const supabase = getSupabaseAdmin();
  const [{ data: sub }, { data: assign }] = await Promise.all([
    supabase
      .from('shift_submissions')
      .select('available')
      .eq('shift_slot_id', slotId)
      .eq('user_id', auth.userId)
      .maybeSingle(),
    supabase
      .from('shift_assignments')
      .select('role')
      .eq('shift_slot_id', slotId)
      .eq('user_id', auth.userId)
      .maybeSingle(),
  ]);
  // 調整中（draft）の割り振りは本人に見せていないので、立場の判定にも役割の表示にも使わない
  const publishedRole = slot.assignment_status === 'published' ? (assign?.role ?? null) : null;
  if (
    !isAbsenceEligible({
      submittedAvailable: sub?.available ?? null,
      publishedAssigned: publishedRole !== null,
    })
  ) {
    return jsonError('このシフトに出る予定になっていません', 403, 'NOT_ELIGIBLE');
  }

  const { error } = await supabase
    .from('absence_reports')
    .insert({ user_id: auth.userId, shift_slot_id: slotId, reason });
  if (error) {
    // UNIQUE 違反＝すでに連絡済み（二重送信など）
    if (error.code === '23505') {
      return jsonError('すでに欠席を連絡しています', 409, 'ALREADY_REPORTED');
    }
    return jsonError('欠席連絡に失敗しました', 500, 'ABSENCE_FAILED');
  }

  const notified = await notifyCoreMembers(
    auth.userId,
    buildAbsenceMessage({ name: auth.name, slot, role: publishedRole, reason })
  );
  return jsonOk({ ok: true, notified }, 201);
}

// DELETE: 欠席連絡を取り消す（開始時刻まで）。取り消したこともコアメンバーに知らせる。
async function deleteHandler(_req: Request, { params }: Params) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const auth = await authenticateUser();
  if (!auth.ok) return auth.response;

  const slotId = (await params).id;
  if (!isUuid(slotId)) return notFound('シフト枠が見つかりません');

  const slot = await loadSlot(slotId);
  if (!slot) return notFound('シフト枠が見つかりません');

  // 連絡は期限後にしか出せないので、取り消しで問題になるのは開始時刻を過ぎた場合だけ
  if (absenceWindow(slot) === 'started') return windowError('started');

  const supabase = getSupabaseAdmin();
  const { data: deleted, error } = await supabase
    .from('absence_reports')
    .delete()
    .eq('shift_slot_id', slotId)
    .eq('user_id', auth.userId)
    .select('id');
  if (error) return jsonError('取り消しに失敗しました', 500, 'CANCEL_FAILED');
  if (!deleted || deleted.length === 0) {
    return jsonError('欠席連絡は出ていません', 404, 'NOT_REPORTED');
  }

  const notified = await notifyCoreMembers(
    auth.userId,
    buildAbsenceCancelMessage({ name: auth.name, slot })
  );
  return jsonOk({ ok: true, notified });
}

export const POST = withRoute(postHandler);
export const DELETE = withRoute(deleteHandler);
