import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { sendMulticast } from '@/lib/line';
import { NO_ROLE } from '@/types';
import { jsonError, jsonOk, verifyOrigin, forbiddenOrigin, withRoute, isUuid, notFound } from '@/lib/http';

const MULTICAST_CHUNK = 500; // LINE multicast の宛先上限

type Params = { params: Promise<{ shiftId: string }> };

// POST: 確定・公開（管理者）。status を published にし、割り振られたスタッフへ LINE 通知。
async function postHandler(_req: Request, { params }: Params) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const slotId = (await params).shiftId;
  if (!isUuid(slotId)) return notFound('シフト枠が見つかりません');

  const supabase = getSupabaseAdmin();

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

  const buildMessage = (role: string) =>
    role === NO_ROLE
      ? `シフト確定: ${slot.date} ${startHm}〜${endHm} 出勤です（役割の指定はありません）`
      : `シフト確定: ${slot.date} ${startHm}〜${endHm} あなたの役割は「${role}」です`;

  // メッセージは役割ごとに異なるため、同一メッセージの連携済みユーザーをまとめて multicast する。
  const linked: { userId: string; lineUserId: string; message: string }[] = [];
  const logs: {
    user_id: string;
    notification_type: 'shift_confirmed';
    message: string;
    status: 'sent' | 'failed';
  }[] = [];

  for (const a of assignments ?? []) {
    const u = Array.isArray(a.users) ? a.users[0] : a.users;
    const lineUserId = u?.line_user_id ?? null;
    const message = buildMessage(a.role);
    if (!lineUserId) {
      logs.push({ user_id: a.user_id, notification_type: 'shift_confirmed', message, status: 'failed' });
      continue;
    }
    linked.push({ userId: a.user_id, lineUserId, message });
  }

  // メッセージ別にグループ化して multicast（各グループ 500 件ごと）
  const byMessage = new Map<string, string[]>();
  for (const e of linked) {
    const arr = byMessage.get(e.message) ?? [];
    arr.push(e.lineUserId);
    byMessage.set(e.message, arr);
  }
  const messageOk = new Map<string, boolean>();
  for (const [message, ids] of byMessage) {
    let allOk = true;
    for (let i = 0; i < ids.length; i += MULTICAST_CHUNK) {
      const ok = await sendMulticast(ids.slice(i, i + MULTICAST_CHUNK), message);
      if (!ok) allOk = false;
    }
    messageOk.set(message, allOk);
  }

  let notified = 0;
  for (const e of linked) {
    const ok = messageOk.get(e.message) ?? false;
    if (ok) notified++;
    logs.push({
      user_id: e.userId,
      notification_type: 'shift_confirmed',
      message: e.message,
      status: ok ? 'sent' : 'failed',
    });
  }

  if (logs.length > 0) {
    await supabase.from('notification_logs').insert(logs);
  }

  const skipped = (assignments?.length ?? 0) - notified;
  return jsonOk({ ok: true, notified, skipped });
}

export const POST = withRoute(postHandler);
