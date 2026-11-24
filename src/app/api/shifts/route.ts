import { getSupabaseAdmin } from '@/lib/supabase';
import { authenticateUser, authenticateAdmin } from '@/lib/middleware';
import { createShiftSchema } from '@/lib/validators';
import { rolesForSlotType } from '@/lib/role-assignment';
import {
  computeDeadline,
  deadlineFromDate,
  isExpired,
  compareSlotsUpcomingFirst,
  todayJst,
} from '@/lib/datetime';
import { absenceWindow, isAbsenceEligible } from '@/lib/absence';
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
      const slots = data ?? [];

      // 一覧に出す提出の進み具合（対象者数・提出数・○の数）。今日以降の枠だけ数える
      // （終わった枠は要らない＝読む行数を増やさない。Supabase は1回に返す行数に上限がある）。
      const today = todayJst();
      const activeIds = slots.filter((s) => s.date >= today).map((s) => s.id as string);
      const progress = new Map<string, { targets: number; submitted: number; available: number }>();
      if (activeIds.length > 0) {
        const [{ data: tRows }, { data: sRows }] = await Promise.all([
          supabase.from('shift_target_users').select('shift_slot_id, user_id').in('shift_slot_id', activeIds),
          supabase
            .from('shift_submissions')
            .select('shift_slot_id, user_id, available')
            .in('shift_slot_id', activeIds),
        ]);
        const targetKeys = new Set<string>();
        for (const t of tRows ?? []) {
          const id = t.shift_slot_id as string;
          targetKeys.add(`${id}:${t.user_id}`);
          const p = progress.get(id) ?? { targets: 0, submitted: 0, available: 0 };
          p.targets++;
          progress.set(id, p);
        }
        for (const s of sRows ?? []) {
          const id = s.shift_slot_id as string;
          // 対象から外した人の提出は数えない（枠詳細の提出状況と同じ数になるように）
          if (!targetKeys.has(`${id}:${s.user_id}`)) continue;
          const p = progress.get(id);
          if (!p) continue;
          p.submitted++;
          if (s.available) p.available++;
        }
      }

      // 締切済みかどうかはサーバの時刻で判定して返す（一覧に出すため）。
      // 並びはスタッフ側と同じ「今日以降を近い順 → 終わった枠」（以前は日付の古い順で、
      // 終わった枠が上に溜まっていた。2026-11-24 UI 見直し M1）。
      return jsonOk({
        slots: slots
          .map((slot) => ({
            ...slot,
            expired: isExpired(slot.deadline),
            progress: progress.get(slot.id as string) ?? null,
          }))
          .sort((a, b) => compareSlotsUpcomingFirst(a, b, today)),
      });
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

  const [{ data: subs }, { data: assigns }, { data: absences }] = await Promise.all([
    supabase
      .from('shift_submissions')
      .select('shift_slot_id, available, note')
      .eq('user_id', user.userId)
      .in('shift_slot_id', slotIds),
    supabase
      .from('shift_assignments')
      .select('shift_slot_id')
      .eq('user_id', user.userId)
      .in('shift_slot_id', slotIds),
    // 010 を適用する前の DB ではエラーになるが、data が null になるだけで一覧は出せる
    supabase
      .from('absence_reports')
      .select('shift_slot_id, reason, created_at')
      .eq('user_id', user.userId)
      .in('shift_slot_id', slotIds),
  ]);
  const subBySlot = new Map(
    (subs ?? []).map((s) => [s.shift_slot_id, s])
  );
  const assignedSlots = new Set((assigns ?? []).map((a) => a.shift_slot_id as string));
  const absenceBySlot = new Map((absences ?? []).map((a) => [a.shift_slot_id as string, a]));

  const now = Date.now();
  const result = (slots ?? [])
    .map((slot) => {
      const sub = subBySlot.get(slot.id);
      const absence = absenceBySlot.get(slot.id);
      const absenceWin = absenceWindow(slot, now);
      // 調整中（draft）の割り振りは本人に見せていないので、確定済みのものだけ数える
      const publishedAssigned =
        slot.assignment_status === 'published' && assignedSlots.has(slot.id);
      return {
        ...slot,
        expired: isExpired(slot.deadline),
        submission: sub
          ? { available: sub.available, note: sub.note }
          : null,
        absence: absence ? { reason: absence.reason, created_at: absence.created_at } : null,
        // 欠席連絡を出せる（期限後〜開始前・○で提出か確定済みの割り振りあり・まだ出していない）
        can_report_absence:
          absenceWin === 'open' &&
          !absence &&
          isAbsenceEligible({ submittedAvailable: sub?.available ?? null, publishedAssigned }),
        // 出した欠席連絡を取り消せる（開始前）
        can_cancel_absence: Boolean(absence) && absenceWin !== 'started',
      };
    })
    // 未来のシフトを上（次のシフトが先頭）・過ぎたシフトを下、同日内は開始時刻順
    .sort(compareSlotsUpcomingFirst);

  return jsonOk({ slots: result });
}

// POST: シフト枠作成（管理者）。
async function postHandler(req: Request) {
  if (!(await verifyOrigin())) return forbiddenOrigin();
  const admin = await authenticateAdmin();
  if (!admin.ok) return admin.response;

  const parsed = await parseBody(req, createShiftSchema);
  if (!parsed.ok) return parsed.response;
  const {
    slot_type,
    date,
    start_time,
    end_time,
    title,
    deadline_date,
    deadline_days_before,
    note,
    target_user_ids,
  } = parsed.data;

  const supabase = getSupabaseAdmin();
  // 期限の日付が指定されていればその日、無ければ「何日前」（既定は14日前）で決める
  const deadline = deadline_date
    ? deadlineFromDate(deadline_date)
    : computeDeadline(date, deadline_days_before);

  const { data: slot, error } = await supabase
    .from('shift_slots')
    .insert({
      slot_type,
      date,
      start_time,
      end_time,
      deadline,
      note: note ?? null,
      // 未入力なら列ごと送らない（title 列を追加する前の DB でも作成できるように）
      ...(title ? { title } : {}),
    })
    .select('*')
    .single();
  if (error || !slot) {
    return jsonError('シフト枠の作成に失敗しました', 500, 'CREATE_FAILED');
  }

  // 対象スタッフ
  const targetIds = target_user_ids ?? [];
  const { error: targetErr } =
    targetIds.length > 0
      ? await supabase
          .from('shift_target_users')
          .insert(targetIds.map((user_id) => ({ shift_slot_id: slot.id, user_id })))
      : { error: null };

  // 役割別必要人数（初期値 0）
  const reqRows = rolesForSlotType(slot_type).map((role) => ({
    shift_slot_id: slot.id,
    role,
    required_count: 0,
  }));
  const { error: reqErr } = await supabase
    .from('shift_role_requirements')
    .insert(reqRows);

  // 付随データの作成に失敗したら、対象者/必要人数の無い不完全な枠が
  // 残らないよう、作成した枠を取り消す（関連は CASCADE で消える）。
  if (targetErr || reqErr) {
    await supabase.from('shift_slots').delete().eq('id', slot.id);
    return jsonError('シフト枠の作成に失敗しました', 500, 'CREATE_FAILED');
  }

  return jsonOk({ slot }, 201);
}

export const GET = withRoute(getHandler);
export const POST = withRoute(postHandler);
