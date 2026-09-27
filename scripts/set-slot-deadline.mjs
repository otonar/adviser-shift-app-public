// 特定のシフト枠だけ提出期限（deadline）を手で変える。
//
// 使い方:
//   node --env-file=.env.local scripts/set-slot-deadline.mjs          … 見るだけ（既定）
//   node --env-file=.env.local scripts/set-slot-deadline.mjs --apply  … 実際に書き換える
//
// 期限は通常「枠の日付の14日前 23:59:59 JST」で自動計算される（src/lib/datetime.ts）。
// 例外的に延ばしたい・縮めたい枠があるときだけ、下の TARGETS に書いて使う。
//
// 注意:
//   - 管理画面でその枠の**日付を変更すると期限は14日前ルールで計算し直される**
//     （ここで設定した期限は消える）。時刻・メモ・人数の変更では消えない。
//   - 期限日の朝に LINE の提出リマインドが未提出者へ送られる（/api/cron/remind-submissions）。
//     期限を延ばすとその日に改めてリマインドが飛ぶ。
//   - 枠は日付で特定する。**その日の枠が1件でなければ何もせず中止**する。
//
// 安全のため、このスクリプトは文字列で SQL を組み立てない（Supabase client の
// パラメータバインディングのみ）。

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    '環境変数が未設定です。次のように実行してください:\n' +
      '  node --env-file=.env.local scripts/set-slot-deadline.mjs\n' +
      '（NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要）'
  );
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

// ---- 変更する枠 -------------------------------------------------------------
// date = 枠の日付 / deadlineDate = 新しい期限の日付（その日の 23:59:59 JST まで受け付ける）
//
// 実績: 2026-09-27 に 10/3・10/10 研修の期限を 10/2 まで延長（対象者の再設定が
// 遅れて14日前ルールの期限が既に過ぎていたため）。
const TARGETS = [
  { date: '2026-10-03', deadlineDate: '2026-10-02' },
  { date: '2026-10-10', deadlineDate: '2026-10-02' },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const toDeadline = (d) => `${d}T23:59:59+09:00`;
const jst = (iso) => new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(APPLY ? '★ 書き換えモード（--apply）' : '見るだけモード（書き換えません）');

  for (const t of TARGETS) {
    if (!DATE_RE.test(t.date) || !DATE_RE.test(t.deadlineDate)) {
      throw new Error(`日付の形式が不正です: ${JSON.stringify(t)}`);
    }
    if (t.deadlineDate > t.date) {
      throw new Error(`期限が枠の日付より後になっています: ${JSON.stringify(t)}`);
    }
  }

  const dates = TARGETS.map((t) => t.date);
  const [{ data: slots, error }, { data: targets, error: tErr }, { data: subs, error: sErr }] =
    await Promise.all([
      supabase
        .from('shift_slots')
        .select('id, date, slot_type, start_time, end_time, deadline, assignment_status, note')
        .in('date', dates),
      supabase.from('shift_target_users').select('shift_slot_id'),
      supabase.from('shift_submissions').select('shift_slot_id'),
    ]);
  if (error || tErr || sErr) throw new Error(`取得に失敗: ${(error ?? tErr ?? sErr).message}`);

  const problems = [];
  const plan = [];
  for (const t of TARGETS) {
    const hits = (slots ?? []).filter((s) => s.date === t.date);
    if (hits.length !== 1) {
      problems.push(`${t.date} の枠 → ${hits.length} 件一致（1件でないので実行しません）`);
      continue;
    }
    plan.push({ slot: hits[0], deadline: toDeadline(t.deadlineDate) });
  }

  console.log('');
  for (const { slot: s, deadline } of plan) {
    const nTarget = (targets ?? []).filter((x) => x.shift_slot_id === s.id).length;
    const nSub = (subs ?? []).filter((x) => x.shift_slot_id === s.id).length;
    console.log(
      `  ${s.date} ${s.slot_type === 'day' ? '当日' : '研修'} ${s.start_time}-${s.end_time} ` +
        `${s.assignment_status}  対象者${nTarget} 提出${nSub}  note=${s.note ?? '（なし）'}`
    );
    console.log(`    期限: ${jst(s.deadline)}  →  ${jst(deadline)}`);
    if (s.assignment_status !== 'open') {
      console.log('    ⚠ この枠は受付中（open）ではありません。期限を延ばしても割り振り済みの扱いは変わりません。');
    }
    if (nTarget === 0) {
      console.log('    ⚠ 対象者が0人です。管理画面で対象者を選ばないと誰も提出できません。');
    }
  }

  if (problems.length > 0) {
    console.log('\n⚠ 実行できません:');
    for (const p of problems) console.log(`  ${p}`);
    process.exit(1);
  }

  if (!APPLY) {
    console.log('\n実際に書き換えるには --apply を付けて実行する:');
    console.log('  node --env-file=.env.local scripts/set-slot-deadline.mjs --apply');
    return;
  }

  for (const { slot, deadline } of plan) {
    const { error: uErr } = await supabase
      .from('shift_slots')
      .update({ deadline, updated_at: new Date().toISOString() })
      .eq('id', slot.id);
    if (uErr) throw new Error(`${slot.date} の更新に失敗: ${uErr.message}`);
  }

  const { data: after, error: aErr } = await supabase
    .from('shift_slots')
    .select('date, deadline')
    .in('id', plan.map((p) => p.slot.id));
  if (aErr) throw new Error(`確認の取得に失敗: ${aErr.message}`);
  console.log('\n書き換え後（DB を読み直した値）:');
  for (const s of after ?? []) console.log(`  ${s.date}  期限 ${jst(s.deadline)}`);
}

main().catch((e) => {
  console.error('\n失敗:', e.message);
  process.exit(1);
});
