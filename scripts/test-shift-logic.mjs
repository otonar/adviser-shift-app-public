// シフトの中核ロジック（役割割り振り・日付計算）の回帰テスト。
//
//   npm run test:shift      （npm test で analytics と一緒に走る）
//
// なぜこれがあるのか:
//   `docs/TEST_CHECKLIST.md` の §3・§5 は「希少な役割から埋まること」「1人1役割」
//   「期限が日付−14日の23:59 JST になること」を**人が画面を見て**確かめる手順だった。
//   これらは DB に触らない純粋関数（src/lib/role-assignment.ts・src/lib/datetime.ts）
//   の性質なので、手で確かめ続ける代わりにここで固定する。
//   本番 DB を汚さずに何度でも回せるのが利点。
//
// 割り振りはランダムシャッフルを含むので、「誰が選ばれるか」ではなく
// **何度繰り返しても崩れない性質**を確かめる（回数は ITERATIONS）。
//
// テストランナーは入れていない。esbuild（既に devDependency）で TS をその場で
// バンドルして読み込むだけなので、依存を増やさずに動く。

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function load(entry) {
  const result = await build({
    entryPoints: [resolve(root, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    tsconfig: resolve(root, 'tsconfig.json'),
    write: false,
  });
  const code = result.outputFiles[0].text;
  return import(
    `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  );
}

const { assignRoles, rolesForSlotType } = await load('src/lib/role-assignment.ts');
const {
  computeDeadline,
  isExpired,
  compareSlotsUpcomingFirst,
  formatStockFreshness,
} = await load('src/lib/datetime.ts');

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
function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failed++;
    console.log(`  NG   ${label}${detail ? `\n       ${detail}` : ''}`);
  }
}

const ITERATIONS = 50; // シャッフルがあるので繰り返して性質を見る

// ===== 役割割り振り =========================================================
console.log('\n■ 役割割り振り（src/lib/role-assignment.ts）');

check('当日枠の役割', rolesForSlotType('day'), [
  '全体会',
  '受付',
  'アテンド',
  'PC',
  '共済',
  '学び',
]);
check('研修枠の役割', rolesForSlotType('training'), [
  'コアメンバー',
  'PC',
  '共済',
  '学び',
]);

// --- 基本ケース: 提出した人だけが、担当できる役割に、1人1役割で入る ---------
{
  const users = [
    { userId: 'a', dayRoles: ['受付', 'PC'], trainingRoles: [] },
    { userId: 'b', dayRoles: ['受付'], trainingRoles: [] },
    { userId: 'c', dayRoles: ['PC'], trainingRoles: [] },
    { userId: 'x', dayRoles: ['受付', 'PC'], trainingRoles: [] }, // ×を出した人
    { userId: 'y', dayRoles: ['受付', 'PC'], trainingRoles: [] }, // 未提出の人
  ];
  const submissions = [
    { userId: 'a', available: true },
    { userId: 'b', available: true },
    { userId: 'c', available: true },
    { userId: 'x', available: false },
    // y は提出していない＝submissions に行が無い
  ];
  const reqs = [
    { role: '受付', requiredCount: 1 },
    { role: 'PC', requiredCount: 1 },
  ];

  let allOk = { once: true, capacity: true, available: true, canDo: true };
  for (let i = 0; i < ITERATIONS; i++) {
    const r = assignRoles('day', reqs, submissions, users);
    const ids = r.map((x) => x.userId);
    if (new Set(ids).size !== ids.length) allOk.once = false;
    for (const req of reqs) {
      if (r.filter((x) => x.role === req.role).length > req.requiredCount)
        allOk.capacity = false;
    }
    if (r.some((x) => x.userId === 'x' || x.userId === 'y')) allOk.available = false;
    for (const x of r) {
      if (x.role === '役割なし') continue;
      const u = users.find((u) => u.userId === x.userId);
      if (!u.dayRoles.includes(x.role)) allOk.canDo = false;
    }
  }
  ok('1人が2つの役割に入らない', allOk.once);
  ok('必要人数を超えて割り振らない', allOk.capacity);
  ok('×を出した人・未提出の人は割り振られない', allOk.available);
  ok('担当できない役割には入らない', allOk.canDo);
}

// --- 希少な役割が先に埋まる -------------------------------------------------
// 「共済」ができるのは a だけ。a は「受付」もできるが、受付は b も c もできる。
// 先に多い方から埋めると a が受付に取られて共済が空く。少ない順に埋めれば埋まる。
{
  const users = [
    { userId: 'a', dayRoles: ['受付', '共済'], trainingRoles: [] },
    { userId: 'b', dayRoles: ['受付'], trainingRoles: [] },
    { userId: 'c', dayRoles: ['受付'], trainingRoles: [] },
  ];
  const submissions = users.map((u) => ({ userId: u.userId, available: true }));
  const reqs = [
    { role: '受付', requiredCount: 2 },
    { role: '共済', requiredCount: 1 },
  ];
  let kyosaiFilled = true;
  let aInKyosai = true;
  for (let i = 0; i < ITERATIONS; i++) {
    const r = assignRoles('day', reqs, submissions, users);
    if (r.filter((x) => x.role === '共済').length !== 1) kyosaiFilled = false;
    if (!r.some((x) => x.userId === 'a' && x.role === '共済')) aInKyosai = false;
  }
  ok('希少な役割（担当できる人が少ない）から先に埋まる', kyosaiFilled);
  ok('唯一の担当可能者が希少な役割に入る', aInKyosai);
}

// --- 足りないときは埋まらない（欠員がそのまま出る）--------------------------
{
  const users = [{ userId: 'a', dayRoles: ['受付'], trainingRoles: [] }];
  const r = assignRoles(
    'day',
    [{ role: '受付', requiredCount: 3 }],
    [{ userId: 'a', available: true }],
    users
  );
  check('候補が足りなければ埋まらない（1人だけ）', r.length, 1);
  check('その1人は受付', r[0].role, '受付');
}

// --- 役割が付かなかった人は「役割なし」で出勤扱い ---------------------------
{
  const users = [
    { userId: 'a', dayRoles: ['受付'], trainingRoles: [] },
    { userId: 'b', dayRoles: [], trainingRoles: [] }, // 役割を設定していない人
  ];
  const r = assignRoles(
    'day',
    [{ role: '受付', requiredCount: 1 }],
    users.map((u) => ({ userId: u.userId, available: true })),
    users
  );
  check('出られる人は全員名簿に載る', r.length, 2);
  check(
    '役割が付かない人は「役割なし」',
    r.find((x) => x.userId === 'b').role,
    '役割なし'
  );
}

// --- required_count = 0 の役割は割り振らない --------------------------------
{
  const users = [{ userId: 'a', dayRoles: ['受付', 'PC'], trainingRoles: [] }];
  const r = assignRoles(
    'day',
    [
      { role: '受付', requiredCount: 0 },
      { role: 'PC', requiredCount: 1 },
    ],
    [{ userId: 'a', available: true }],
    users
  );
  check('必要人数0の役割には入らない', r[0].role, 'PC');
}

// --- 研修枠では training_roles を見る（day_roles は使わない）----------------
{
  const users = [
    { userId: 'a', dayRoles: ['PC'], trainingRoles: [] }, // 当日はPCだが研修ではPCではない
    { userId: 'b', dayRoles: [], trainingRoles: ['PC'] },
  ];
  const submissions = users.map((u) => ({ userId: u.userId, available: true }));
  let onlyB = true;
  for (let i = 0; i < ITERATIONS; i++) {
    const r = assignRoles('training', [{ role: 'PC', requiredCount: 1 }], submissions, users);
    if (!r.some((x) => x.userId === 'b' && x.role === 'PC')) onlyB = false;
    if (r.some((x) => x.userId === 'a' && x.role === 'PC')) onlyB = false;
  }
  ok('研修枠は研修用の役割で判定する（当日用の役割は使わない）', onlyB);
}

// ===== 日付・期限 ===========================================================
console.log('\n■ 日付・期限（src/lib/datetime.ts）');

check('期限 = 日付の14日前 23:59:59 JST', computeDeadline('2026-04-03'), '2026-03-20T23:59:59+09:00');
check('月をまたぐ', computeDeadline('2026-03-01'), '2026-02-15T23:59:59+09:00');
check('年をまたぐ', computeDeadline('2026-01-05'), '2025-12-22T23:59:59+09:00');
check('うるう年の2月を含む', computeDeadline('2028-03-01'), '2028-02-16T23:59:59+09:00');

check('過去の期限は期限切れ', isExpired('2020-01-01T23:59:59+09:00'), true);
check('未来の期限は期限切れでない', isExpired('2999-01-01T23:59:59+09:00'), false);

{
  const today = '2026-04-10';
  const slots = [
    { date: '2026-04-09', start_time: '10:00:00' }, // 過ぎた
    { date: '2026-04-12', start_time: '13:00:00' },
    { date: '2026-04-12', start_time: '09:00:00' }, // 同じ日の早い方
    { date: '2026-04-10', start_time: '10:00:00' }, // 今日は「これから」扱い
  ];
  const sorted = [...slots].sort((a, b) => compareSlotsUpcomingFirst(a, b, today));
  check(
    '未来が先・今日は未来扱い・同日は開始時刻順・過ぎた枠は末尾',
    sorted.map((s) => `${s.date} ${s.start_time.slice(0, 5)}`),
    ['2026-04-10 10:00', '2026-04-12 09:00', '2026-04-12 13:00', '2026-04-09 10:00']
  );
}

{
  const now = Date.now();
  const hoursAgo = (h) => new Date(now - h * 3600 * 1000).toISOString();
  check('在庫: 23時間前は古く扱わない', formatStockFreshness(hoursAgo(23)).stale, false);
  check('在庫: 25時間前は古い扱い', formatStockFreshness(hoursAgo(25)).stale, true);
  check('在庫: 更新日時が無ければ不明・古い扱い', formatStockFreshness(null), {
    text: '更新日時 不明',
    relative: '不明',
    stale: true,
  });
  check('在庫: 数分前の表現', formatStockFreshness(new Date(now - 5 * 60000).toISOString()).relative, '5分前');
}

console.log(failed === 0 ? '\n=> 全項目 OK' : `\n=> ${failed} 件失敗`);
process.exit(failed === 0 ? 0 : 1);
