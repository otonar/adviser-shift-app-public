// 分析ダッシュボード（/admin/analytics）の集計ロジックの回帰テスト。
//
//   npm run test:analytics
//
// なぜこれだけテストがあるのか:
//   集計は「壊れても画面はそれらしく表示され、数字だけが静かに間違う」種類のコード。
//   提出率や欠員の数字は運用の判断に使われるので、作った入力に対して期待どおりの
//   数字が出ることを機械的に確かめられるようにしてある。
//   src/lib/analytics.ts は DB に触らない純粋な計算なので、ここから直接呼べる。
//
// テストランナーは入れていない。esbuild（既に devDependency）で TS をその場で
// バンドルして読み込むだけなので、依存を増やさずに動く。

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// src/lib/analytics.ts をメモリ上でバンドルして import する（tsconfig の @/ も解決される）
const result = await build({
  entryPoints: [resolve(root, 'src/lib/analytics.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  tsconfig: resolve(root, 'tsconfig.json'),
  write: false,
});
const code = result.outputFiles[0].text;
const { computeAnalytics } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);

let failed = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  OK   ${label} = ${a}`);
  } else {
    failed++;
    console.log(`  NG   ${label}\n       期待: ${e}\n       実際: ${a}`);
  }
}

// 締切: 過去 = 締切済み、未来 = まだ出せる
const PAST = '2020-01-01T23:59:59+09:00';
const FUTURE = '2999-01-01T23:59:59+09:00';

const slot = (id, status, deadline, slot_type = 'day') => ({
  id,
  date: '2026-04-03',
  start_time: '10:00:00',
  end_time: '15:00:00',
  slot_type,
  deadline,
  assignment_status: status,
});

const input = {
  userRows: [
    { id: 'u1', name: 'あき', is_active: true },
    { id: 'u2', name: 'いとう', is_active: true },
    { id: 'u3', name: 'うえだ', is_active: true },
    { id: 'u4', name: 'やめた人', is_active: false },
  ],
  slotRows: [
    slot('sOpenFuture', 'open', FUTURE), // 受付中・まだ締切前
    slot('sOpenPast', 'open', PAST), // 受付中だが締切済み
    slot('sPublished', 'published', PAST), // 確定済み
    slot('sDraft', 'draft', PAST), // 調整中
  ],
  targetRows: [
    // 受付中(未来): u1,u2,u3 と 脱退者 u4 が対象。u1 だけ提出済み
    { shift_slot_id: 'sOpenFuture', user_id: 'u1' },
    { shift_slot_id: 'sOpenFuture', user_id: 'u2' },
    { shift_slot_id: 'sOpenFuture', user_id: 'u3' },
    { shift_slot_id: 'sOpenFuture', user_id: 'u4' },
    // 締切済みの枠: u1,u2 が対象。u1 のみ提出
    { shift_slot_id: 'sOpenPast', user_id: 'u1' },
    { shift_slot_id: 'sOpenPast', user_id: 'u2' },
    // 確定済みの枠: u1,u2,u3 が対象。全員提出
    { shift_slot_id: 'sPublished', user_id: 'u1' },
    { shift_slot_id: 'sPublished', user_id: 'u2' },
    { shift_slot_id: 'sPublished', user_id: 'u3' },
  ],
  submissionRows: [
    { shift_slot_id: 'sOpenFuture', user_id: 'u1', available: true },
    { shift_slot_id: 'sOpenPast', user_id: 'u1', available: true },
    { shift_slot_id: 'sPublished', user_id: 'u1', available: true },
    { shift_slot_id: 'sPublished', user_id: 'u2', available: true },
    { shift_slot_id: 'sPublished', user_id: 'u3', available: false },
  ],
  requirementRows: [
    // 確定枠: 受付2人必要 → 1人しか入っていない（不足1）
    { shift_slot_id: 'sPublished', role: '受付', required_count: 2 },
    // 確定枠: PC 1人必要 → 2人入っている（過剰。他の枠の不足を埋めないこと）
    { shift_slot_id: 'sPublished', role: 'PC', required_count: 1 },
    // 調整中の枠: 受付2人必要 → 1人（不足1）。draft も充足の集計に入る
    { shift_slot_id: 'sDraft', role: '受付', required_count: 2 },
    // 受付中の枠は割り振り前なので集計対象外であること
    { shift_slot_id: 'sOpenFuture', role: '受付', required_count: 5 },
    // required_count = 0 は対象外
    { shift_slot_id: 'sPublished', role: '共済', required_count: 0 },
  ],
  assignmentRows: [
    { shift_slot_id: 'sPublished', user_id: 'u1', role: '受付' },
    { shift_slot_id: 'sPublished', user_id: 'u2', role: 'PC' },
    { shift_slot_id: 'sPublished', user_id: 'u3', role: 'PC' },
    { shift_slot_id: 'sPublished', user_id: 'u1', role: '役割なし' },
    // 調整中の枠の割り当ては「役割の偏り」には数えない（確定のみ）
    { shift_slot_id: 'sDraft', user_id: 'u1', role: '受付' },
  ],
};

const a = computeAnalytics(input);

console.log('\n■ 全体');
check('totalSlots', a.totalSlots, 4);
check('activeMemberCount（脱退者を除く）', a.activeMemberCount, 3);

console.log('\n■ 受付中の枠（open のみ・締切が近い順）');
check('件数', a.openSlots.length, 2);
check(
  '並び順（締切が近い順）',
  a.openSlots.map((s) => s.slotId),
  ['sOpenPast', 'sOpenFuture']
);
const future = a.openSlots.find((s) => s.slotId === 'sOpenFuture');
check('脱退者を分母から除く targetCount', future.targetCount, 3);
check('submittedCount', future.submittedCount, 1);
check('未提出者（脱退者を含まない・名前順）', future.notSubmitted, ['いとう', 'うえだ']);
check('expired（未来の締切）', future.expired, false);
check(
  'expired（過去の締切）',
  a.openSlots.find((s) => s.slotId === 'sOpenPast').expired,
  true
);

console.log('\n■ メンバーごとの提出率（締切済みの枠だけが分母）');
// 締切済み = sOpenPast, sPublished, sDraft。u1 は 2件対象/2件提出、u2 は 2件/1件、u3 は 1件/1件
check('あき', pick(a.members, 'あき'), { targeted: 2, submitted: 2 });
check('いとう', pick(a.members, 'いとう'), { targeted: 2, submitted: 1 });
check('うえだ', pick(a.members, 'うえだ'), { targeted: 1, submitted: 1 });
check(
  '提出率の低い順に並ぶ',
  a.members.map((m) => m.name),
  ['いとう', 'あき', 'うえだ']
);
check('overall', a.overall, { targeted: 5, submitted: 4 });

console.log('\n■ 役割の偏り（確定済みの枠のみ）');
check('あき（確定枠のみ・調整中は数えない）', byName(a.roleBalance, 'あき'), {
  total: 2,
  byRole: { 受付: 1, 役割なし: 1 },
});
check('いとう', byName(a.roleBalance, 'いとう'), { total: 1, byRole: { PC: 1 } });
check('うえだ', byName(a.roleBalance, 'うえだ'), { total: 1, byRole: { PC: 1 } });
check(
  '割り当て回数の多い順',
  a.roleBalance.map((r) => r.name),
  ['あき', 'いとう', 'うえだ']
);

console.log('\n■ 役割ごとの充足（受付中の枠は対象外）');
const uketsuke = a.shortfalls.find((s) => s.role === '受付');
const pc = a.shortfalls.find((s) => s.role === 'PC');
check('受付 required（確定2＋調整中2、受付中の5は含めない）', uketsuke.required, 4);
check('受付 assigned（確定1＋調整中1）', uketsuke.assigned, 2);
check('受付 足りない枠の数（確定・調整中の両方）', uketsuke.shortSlots, 2);
check(
  'PC は過剰でも required を超えて数えない',
  { required: pc.required, assigned: pc.assigned },
  { required: 1, assigned: 1 }
);
check(
  'required_count=0 の共済は出ない',
  a.shortfalls.some((s) => s.role === '共済'),
  false
);
check(
  '不足が大きい順',
  a.shortfalls.map((s) => s.role),
  ['受付', 'PC']
);

function pick(rows, name) {
  const r = rows.find((x) => x.name === name);
  return { targeted: r.targeted, submitted: r.submitted };
}
function byName(rows, name) {
  const r = rows.find((x) => x.name === name);
  return { total: r.total, byRole: r.byRole };
}

console.log(failed === 0 ? '\n=> 全項目 OK' : `\n=> ${failed} 件失敗`);
process.exit(failed === 0 ? 0 : 1);
