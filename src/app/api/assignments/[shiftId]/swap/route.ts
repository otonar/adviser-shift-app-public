import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateAdmin } from '@/lib/middleware';
import { sendMulticast } from '@/lib/line';
import { manualAssignmentSchema } from '@/lib/validators';
import { rolesForSlotType } from '@/lib/role-assignment';
import {
  diffAssignments,
  hasChanges,
  slotWhen,
  confirmedMessage,
  removedMessage,
  roleChangedMessage,
} from '@/lib/assignment-change';
import { NO_ROLE, type SlotType } from '@/types';
import { jsonError, jsonOk, parseBody, verifyOrigin, forbiddenOrigin, withRoute, isUuid, notFound } from '@/lib/http';

const MULTICAST_CHUNK = 500; // LINE multicast の宛先上限

type Params = { params: Promise<{ shiftId: string }> };

// POST: 公開後の差し替え（管理者）。確定（published）のまま割り振りを直し、
// 変更があった人にだけ LINE で知らせる（追加・外れた・役割が変わった）。
// 「やり直し」（全消し→受付中→公開し直しで全員に再送）を使わずに済むようにするためのもの。
// 本文は変更後の割り振りの全体（手動調整の PATCH と同じ形）。
async function postHandler(req: Request, { params }: Params) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const slotId = (await params).shiftId;
  if (!isUuid(slotId)) return notFound('シフト枠が見つかりません');

  const parsed = await parseBody(req, manualAssignmentSchema);
  if (!parsed.ok) return parsed.response;
  const after = parsed.data.assignments;

  // 1人1役割
  if (new Set(after.map((a) => a.userId)).size !== after.length) {
    return jsonError('同じ人が2回入っています', 400, 'DUPLICATE_USER');
  }

  const supabase = getSupabaseAdmin();
  const { data: slot } = await supabase
    .from('shift_slots')
    .select('date, start_time, end_time, title, slot_type, assignment_status')
    .eq('id', slotId)
    .maybeSingle();
  if (!slot) return notFound('シフト枠が見つかりません');
  if (slot.assignment_status !== 'published') {
    return jsonError('確定済みの枠ではありません。調整中の枠は「手動調整を保存」を使ってください', 400, 'NOT_PUBLISHED');
  }

  // 役割はこの枠の種類で使えるもの＋「役割なし」だけ
  const allowedRoles = new Set<string>([...rolesForSlotType(slot.slot_type as SlotType), NO_ROLE]);
  if (after.some((a) => !allowedRoles.has(a.role))) {
    return jsonError('この枠では使えない役割が入っています', 400, 'INVALID_ROLE');
  }

  const [{ data: beforeRows, error: beforeErr }, { data: targetRows }] = await Promise.all([
    supabase
      .from('shift_assignments')
      .select('user_id, role, users(name, line_user_id, is_active)')
      .eq('shift_slot_id', slotId),
    supabase
      .from('shift_target_users')
      .select('user_id, users(name, line_user_id, is_active)')
      .eq('shift_slot_id', slotId),
  ]);
  if (beforeErr) return jsonError('保存に失敗しました', 500, 'SAVE_FAILED');

  type U = { name: string; line_user_id: string | null; is_active: boolean | null };
  const one = (u: U | U[] | null): U | null => (Array.isArray(u) ? (u[0] ?? null) : u);
  const userInfo = new Map<string, U>();
  for (const t of targetRows ?? []) {
    const u = one(t.users as U | U[] | null);
    if (u) userInfo.set(t.user_id, u);
  }
  for (const b of beforeRows ?? []) {
    const u = one(b.users as U | U[] | null);
    if (u) userInfo.set(b.user_id, u);
  }

  const before = (beforeRows ?? []).map((b) => ({ userId: b.user_id as string, role: b.role as string }));
  const diff = diffAssignments(before, after);
  if (!hasChanges(diff)) return jsonOk({ ok: true, changed: false, notified: 0, unnotified: [] });

  // 追加できるのは、この枠の対象者で在籍中の人だけ（○ 以外も可＝急な代役のため）
  const targetIds = new Set((targetRows ?? []).map((t) => t.user_id as string));
  for (const a of diff.added) {
    if (!targetIds.has(a.userId) || userInfo.get(a.userId)?.is_active === false) {
      return jsonError('この枠の対象者（在籍中）以外は追加できません', 400, 'NOT_TARGET');
    }
  }

  // 変更があった行だけを書き換える（変わらない人の行には触らない）
  if (diff.removed.length > 0) {
    const { error } = await supabase
      .from('shift_assignments')
      .delete()
      .eq('shift_slot_id', slotId)
      .in('user_id', diff.removed.map((r) => r.userId));
    if (error) return jsonError('保存に失敗しました', 500, 'SAVE_FAILED');
  }
  for (const c of diff.changed) {
    const { error } = await supabase
      .from('shift_assignments')
      .update({ role: c.to })
      .eq('shift_slot_id', slotId)
      .eq('user_id', c.userId);
    if (error) return jsonError('保存に失敗しました（一部だけ反映されている可能性があります。画面を読み込み直して確認してください）', 500, 'SAVE_FAILED');
  }
  if (diff.added.length > 0) {
    const { error } = await supabase
      .from('shift_assignments')
      .insert(diff.added.map((a) => ({ shift_slot_id: slotId, user_id: a.userId, role: a.role })));
    if (error) return jsonError('保存に失敗しました（一部だけ反映されている可能性があります。画面を読み込み直して確認してください）', 500, 'SAVE_FAILED');
  }
  await supabase
    .from('shift_slots')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', slotId);

  // 変更があった人にだけ知らせる
  const when = slotWhen(slot);
  const messages: { userId: string; message: string }[] = [
    ...diff.added.map((a) => ({ userId: a.userId, message: confirmedMessage(when, a.role) })),
    ...diff.removed.map((r) => ({ userId: r.userId, message: removedMessage(when) })),
    ...diff.changed.map((c) => ({ userId: c.userId, message: roleChangedMessage(when, c.from, c.to) })),
  ];

  const byMessage = new Map<string, string[]>();
  const unnotified: string[] = [];
  const logs: {
    user_id: string;
    notification_type: 'role_assigned';
    message: string;
    status: 'sent' | 'failed';
  }[] = [];
  const pending: { userId: string; message: string }[] = [];
  for (const m of messages) {
    const u = userInfo.get(m.userId);
    // 脱退した人には送らない（ログにも残さない＝公開時と同じ扱い）
    if (u?.is_active === false) continue;
    if (!u?.line_user_id) {
      unnotified.push(u?.name ?? '(不明)');
      logs.push({ user_id: m.userId, notification_type: 'role_assigned', message: m.message, status: 'failed' });
      continue;
    }
    const ids = byMessage.get(m.message) ?? [];
    ids.push(u.line_user_id);
    byMessage.set(m.message, ids);
    pending.push(m);
  }

  const messageOk = new Map<string, boolean>();
  for (const [message, ids] of byMessage) {
    let allOk = true;
    for (let i = 0; i < ids.length; i += MULTICAST_CHUNK) {
      if (!(await sendMulticast(ids.slice(i, i + MULTICAST_CHUNK), message))) allOk = false;
    }
    messageOk.set(message, allOk);
  }

  let notified = 0;
  for (const m of pending) {
    const ok = messageOk.get(m.message) ?? false;
    if (ok) notified++;
    else unnotified.push(userInfo.get(m.userId)?.name ?? '(不明)');
    logs.push({ user_id: m.userId, notification_type: 'role_assigned', message: m.message, status: ok ? 'sent' : 'failed' });
  }
  if (logs.length > 0) await supabase.from('notification_logs').insert(logs);

  return jsonOk({ ok: true, changed: true, notified, unnotified });
}

export const POST = withRoute(postHandler);
