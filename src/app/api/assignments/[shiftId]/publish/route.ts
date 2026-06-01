import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { sendPushMessage } from '@/lib/line';
import { jsonError, jsonOk, verifyOrigin, forbiddenOrigin } from '@/lib/http';

type Params = { params: { shiftId: string } };

// POST: 確定・公開（管理者）。status を published にし、割り振られたスタッフへ LINE 通知。
export async function POST(_req: Request, { params }: Params) {
  if (!verifyOrigin()) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const supabase = getSupabaseAdmin();
  const slotId = params.shiftId;

  const { data: slot } = await supabase
    .from('shift_slots')
    .select('date, start_time, end_time')
    .eq('id', slotId)
    .maybeSingle();
  if (!slot) return jsonError('シフト枠が見つかりません', 404, 'NOT_FOUND');

  // status を published に
  const { error: upError } = await supabase
    .from('shift_slots')
    .update({
      assignment_status: 'published',
      updated_at: new Date().toISOString(),
    })
    .eq('id', slotId);
  if (upError) return jsonError('公開に失敗しました', 500, 'PUBLISH_FAILED');

  // 割り振られたスタッフ（LINE 連携済みのみ通知）
  const { data: assignments } = await supabase
    .from('shift_assignments')
    .select('user_id, role, users(line_user_id)')
    .eq('shift_slot_id', slotId);

  const startHm = slot.start_time.slice(0, 5);
  const endHm = slot.end_time.slice(0, 5);

  let notified = 0;
  let skipped = 0;

  for (const a of assignments ?? []) {
    const u = Array.isArray(a.users) ? a.users[0] : a.users;
    const lineUserId = u?.line_user_id ?? null;
    const message = `シフト確定: ${slot.date} ${startHm}〜${endHm} あなたの役割は「${a.role}」です`;

    if (!lineUserId) {
      skipped++;
      await supabase.from('notification_logs').insert({
        user_id: a.user_id,
        notification_type: 'shift_confirmed',
        message,
        status: 'failed',
      });
      continue;
    }

    const ok = await sendPushMessage(lineUserId, message);
    if (ok) notified++;
    else skipped++;
    await supabase.from('notification_logs').insert({
      user_id: a.user_id,
      notification_type: 'shift_confirmed',
      message,
      status: ok ? 'sent' : 'failed',
    });
  }

  return jsonOk({ ok: true, notified, skipped });
}
