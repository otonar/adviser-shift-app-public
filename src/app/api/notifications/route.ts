import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { sendPushMessage, isLineConfigured } from '@/lib/line';
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
  if (!verifyOrigin()) return forbiddenOrigin();
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

  let sent = 0;
  let skipped = 0;

  for (const u of users ?? []) {
    if (!u.line_user_id) {
      skipped++;
      await supabase.from('notification_logs').insert({
        user_id: u.id,
        notification_type: type,
        message,
        status: 'failed',
      });
      continue;
    }
    const ok = await sendPushMessage(u.line_user_id, message);
    if (ok) sent++;
    else skipped++;
    await supabase.from('notification_logs').insert({
      user_id: u.id,
      notification_type: type,
      message,
      status: ok ? 'sent' : 'failed',
    });
  }

  return jsonOk({ ok: true, sent, skipped });
}

export const GET = withRoute(getHandler);
export const POST = withRoute(postHandler);
