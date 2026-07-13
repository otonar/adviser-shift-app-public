import { getSupabaseAdmin } from '@/lib/supabase';
import { sendPushMessage, isLineConfigured } from '@/lib/line';
import { optionalEnv } from '@/lib/env';
import { jsonError, jsonOk, withRoute } from '@/lib/http';
import { todayJst } from '@/lib/datetime';

// シフト希望の提出リマインド（Vercel Cron から毎朝 JST 8:00 に実行）。
// 提出期限が「今日(JST)」・受付中(open) のシフトについて、対象者のうち
// まだ提出しておらず・アクティブ・LINE 連携済みの人へリマインドを送る。
//
// 保護: Vercel Cron は CRON_SECRET 設定時に Authorization: Bearer <CRON_SECRET>
// を自動付与する。未設定 or 不一致は 401（＝外部から叩けない・未設定なら無効）。

const APP_URL =
  optionalEnv('NEXT_PUBLIC_APP_URL') ?? 'https://adviser-shift-app.vercel.app';

function isAuthorized(req: Request): boolean {
  const secret = optionalEnv('CRON_SECRET');
  if (!secret) return false; // 未設定なら無効（fail closed）
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

// JST の暦日 'YYYY-MM-DD' の翌日を返す（DST の無い JST なので単純加算で安全）。
function nextJstDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + 1);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// 'YYYY-MM-DD' を「7/27(日)」のように JST で整形。
function formatDateJa(date: string): string {
  const d = new Date(`${date}T12:00:00+09:00`);
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(d);
}

const SLOT_TYPE_LABEL: Record<string, string> = { day: '当日', training: '研修' };

type DueSlot = {
  id: string;
  slot_type: string;
  date: string;
  start_time: string;
  end_time: string;
};

async function handler(req: Request) {
  if (!isAuthorized(req)) return jsonError('認証が必要です', 401, 'UNAUTHORIZED');
  if (!isLineConfigured()) {
    // トークン未設定なら送信できない。実行自体は成功として no-op を返す。
    return jsonOk({ ok: true, skipped: 'line_not_configured' });
  }

  const supabase = getSupabaseAdmin();
  const today = todayJst();
  const start = `${today}T00:00:00+09:00`;
  const end = `${nextJstDay(today)}T00:00:00+09:00`;

  // 1. 期限が今日(JST)・受付中のシフト枠
  const { data: slotsRaw, error: slotsErr } = await supabase
    .from('shift_slots')
    .select('id, slot_type, date, start_time, end_time')
    .eq('assignment_status', 'open')
    .gte('deadline', start)
    .lt('deadline', end);
  if (slotsErr) return jsonError('取得に失敗しました', 500, 'FETCH_FAILED');

  const slots = (slotsRaw ?? []) as DueSlot[];
  if (slots.length === 0) {
    return jsonOk({ ok: true, date: today, dueSlots: 0, reminded: 0 });
  }
  const slotIds = slots.map((s) => s.id);
  const slotById = new Map(slots.map((s) => [s.id, s]));

  // 2. 対象者・提出済み
  const [{ data: targets }, { data: submissions }] = await Promise.all([
    supabase
      .from('shift_target_users')
      .select('shift_slot_id, user_id')
      .in('shift_slot_id', slotIds),
    supabase
      .from('shift_submissions')
      .select('shift_slot_id, user_id')
      .in('shift_slot_id', slotIds),
  ]);

  const submitted = new Set(
    (submissions ?? []).map((s) => `${s.shift_slot_id}|${s.user_id}`)
  );

  // 3. 未提出（slot,user）をユーザーごとにまとめる
  const dueByUser = new Map<string, string[]>();
  for (const t of targets ?? []) {
    if (submitted.has(`${t.shift_slot_id}|${t.user_id}`)) continue;
    const arr = dueByUser.get(t.user_id) ?? [];
    arr.push(t.shift_slot_id);
    dueByUser.set(t.user_id, arr);
  }
  if (dueByUser.size === 0) {
    return jsonOk({ ok: true, date: today, dueSlots: slots.length, reminded: 0 });
  }

  // 4. ユーザー情報（アクティブ＆LINE連携のみ対象）
  const userIds = [...dueByUser.keys()];
  const { data: users } = await supabase
    .from('users')
    .select('id, line_user_id, is_active')
    .in('id', userIds);

  // 5. 同日重複送信を防ぐ（今日すでに送信済みの shift_reminder は除外）
  const { data: sentToday } = await supabase
    .from('notification_logs')
    .select('user_id')
    .eq('notification_type', 'shift_reminder')
    .eq('status', 'sent')
    .gte('sent_at', start);
  const alreadySent = new Set((sentToday ?? []).map((r) => r.user_id));

  let sent = 0;
  let failed = 0;
  let skippedUnlinked = 0;
  let skippedDuplicate = 0;
  const logs: {
    user_id: string;
    notification_type: 'shift_reminder';
    message: string;
    status: 'sent' | 'failed';
  }[] = [];

  for (const u of users ?? []) {
    if (!u.is_active) continue;
    if (!u.line_user_id) {
      skippedUnlinked++;
      continue;
    }
    if (alreadySent.has(u.id)) {
      skippedDuplicate++;
      continue;
    }
    const dueSlotIds = dueByUser.get(u.id) ?? [];
    const lines = dueSlotIds
      .map((id) => slotById.get(id))
      .filter((s): s is DueSlot => Boolean(s))
      .sort((a, b) =>
        a.date !== b.date
          ? a.date < b.date
            ? -1
            : 1
          : a.start_time < b.start_time
            ? -1
            : 1
      )
      .map(
        (s) =>
          `・${formatDateJa(s.date)} ${s.start_time.slice(0, 5)}〜${s.end_time.slice(0, 5)}（${SLOT_TYPE_LABEL[s.slot_type] ?? s.slot_type}）`
      );
    if (lines.length === 0) continue;

    const message =
      '【シフト希望 提出リマインド】\n' +
      '本日が提出期限です。まだ希望を提出していないシフトがあります。\n\n' +
      `${lines.join('\n')}\n\n` +
      `アプリから提出してください:\n${APP_URL}/dashboard/shifts`;

    const ok = await sendPushMessage(u.line_user_id, message);
    if (ok) sent++;
    else failed++;
    logs.push({
      user_id: u.id,
      notification_type: 'shift_reminder',
      message,
      status: ok ? 'sent' : 'failed',
    });
  }

  if (logs.length > 0) {
    await supabase.from('notification_logs').insert(logs);
  }

  return jsonOk({
    ok: true,
    date: today,
    dueSlots: slots.length,
    sent,
    failed,
    skippedUnlinked,
    skippedDuplicate,
  });
}

// Vercel Cron は GET で叩く。手動検証用に POST も許可（どちらも要 CRON_SECRET）。
export const GET = withRoute(handler);
export const POST = withRoute(handler);
