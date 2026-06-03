import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { sendMulticast, isLineConfigured } from '@/lib/line';
import { notificationSchema } from '@/lib/validators';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute } from '@/lib/http';

// GET: 通知ログ（管理者）。直近 100 件。
async function getHandler() {
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('notification_logs')
    .select('id, user_id, notification_type, message, status, sent_at')
    .order('sent_at', { ascending: false })
    .limit(100);
  if (error) return jsonError('取得に失敗しました', 500, 'FETCH_FAILED');

  return jsonOk({ logs: data ?? [], line_configured: isLineConfigured() });
}

// POST: LINE 通知の一斉送信（管理者）。
// line_user_id が NULL のユーザーはスキップ。送信結果は notification_logs に記録。
async function postHandler(req: Request) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const parsed = await parseBody(req, notificationSchema);
  if (!parsed.ok) return parsed.response;
  const { type, target_user_ids, message } = parsed.data;

  const supabase = getSupabaseAdmin();

  // 宛先ユーザーを取得（アクティブのみ）
  let query = supabase
    .from('users')
    .select('id, line_user_id')
    .eq('is_active', true);
  if (target_user_ids !== 'all') {
    query = query.in('id', target_user_ids);
  }
  const { data: users, error } = await query;
  if (error) return jsonError('送信に失敗しました', 500, 'SEND_FAILED');

  const recipients = users ?? [];
  const linked = recipients.filter((u) => u.line_user_id) as {
    id: string;
    line_user_id: string;
  }[];

  const logs: {
    user_id: string;
    notification_type: typeof type;
    message: string;
    status: 'sent' | 'failed';
  }[] = [];

  // 同一メッセージなので 500 件ごとに multicast でまとめて送信。
  let sent = 0;
  const CHUNK = 500;
  for (let i = 0; i < linked.length; i += CHUNK) {
    const batch = linked.slice(i, i + CHUNK);
    const ok = await sendMulticast(batch.map((u) => u.line_user_id), message);
    if (ok) sent += batch.length;
    for (const u of batch) {
      logs.push({ user_id: u.id, notification_type: type, message, status: ok ? 'sent' : 'failed' });
    }
  }
  // LINE 未連携はスキップ（失敗ログ）
  for (const u of recipients) {
    if (!u.line_user_id) {
      logs.push({ user_id: u.id, notification_type: type, message, status: 'failed' });
    }
  }

  if (logs.length > 0) {
    await supabase.from('notification_logs').insert(logs);
  }

  const skipped = recipients.length - sent;
  return jsonOk({ ok: true, sent, skipped });
}

export const GET = withRoute(getHandler);
export const POST = withRoute(postHandler);
