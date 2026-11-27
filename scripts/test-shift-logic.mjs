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

const { assignRoles, assignRolesBySession, rolesForSlotType } = await load('src/lib/role-assignment.ts');
const {
  computeDeadline,
  deadlineFromDate,
  deadlineDateJst,
  formatDeadlineJst,
  formatDateJa,
  formatDateTimeJst,
  formatTimeRange,
  addDays,
  daysBetween,
  isRealDate,
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
  '加入',
  'ミルパス',
  '学び',
]);
check('研修枠の役割', rolesForSlotType('training'), [
  'コアメンバー',
  'PC',
  '加入',
  'ミルパス',
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
// 「加入」ができるのは a だけ。a は「受付」もできるが、受付は b も c もできる。
// 先に多い方から埋めると a が受付に取られて加入が空く。少ない順に埋めれば埋まる。
{
  const users = [
    { userId: 'a', dayRoles: ['受付', '加入'], trainingRoles: [] },
    { userId: 'b', dayRoles: ['受付'], trainingRoles: [] },
    { userId: 'c', dayRoles: ['受付'], trainingRoles: [] },
  ];
  const submissions = users.map((u) => ({ userId: u.userId, available: true }));
  const reqs = [
    { role: '受付', requiredCount: 2 },
    { role: '加入', requiredCount: 1 },
  ];
  let kyosaiFilled = true;
  let aInKyosai = true;
  for (let i = 0; i < ITERATIONS; i++) {
    const r = assignRoles('day', reqs, submissions, users);
    if (r.filter((x) => x.role === '加入').length !== 1) kyosaiFilled = false;
    if (!r.some((x) => x.userId === 'a' && x.role === '加入')) aInKyosai = false;
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

// ===== 1日の中の回ごとの割り振り ================================================
console.log('\n■ 回ごとの割り振り（assignRolesBySession）');
{
  // 2人とも受付・アテンドができる。各回 受付1・アテンド1 → 2回目は必ず入れ替わる
  const users = [
    { userId: 'a', dayRoles: ['受付', 'アテンド'], trainingRoles: [] },
    { userId: 'b', dayRoles: ['受付', 'アテンド'], trainingRoles: [] },
  ];
  const subs = users.map((u) => ({ userId: u.userId, available: true }));
  const reqs = [1, 2].flatMap((session) => [
    { session, role: '受付', requiredCount: 1 },
    { session, role: 'アテンド', requiredCount: 1 },
  ]);
  let rotated = true;
  let shape = true;
  for (let i = 0; i < ITERATIONS; i++) {
    const r = assignRolesBySession('day', 2, reqs, subs, users);
    const roleOf = (u, s) => r.find((x) => x.userId === u && x.session === s)?.role;
    if (r.length !== 4) shape = false;
    for (const u of ['a', 'b']) if (roleOf(u, 1) === roleOf(u, 2)) rotated = false;
  }
  ok('前の回と違う役割を優先する（交代できるなら必ず交代）', rotated);
  ok('全員が全部の回に1行ずつ持つ', shape);
}
{
  // 4回・受付1。受付ができる人が2人 → 2回ずつになる
  const users = [
    { userId: 'a', dayRoles: ['受付'], trainingRoles: [] },
    { userId: 'b', dayRoles: ['受付'], trainingRoles: [] },
  ];
  const subs = users.map((u) => ({ userId: u.userId, available: true }));
  const reqs = [1, 2, 3, 4].map((session) => ({ session, role: '受付', requiredCount: 1 }));
  let balanced = true;
  for (let i = 0; i < ITERATIONS; i++) {
    const r = assignRolesBySession('day', 4, reqs, subs, users);
    const count = (u) => r.filter((x) => x.userId === u && x.role === '受付').length;
    if (count('a') !== 2 || count('b') !== 2) balanced = false;
  }
  ok('同じ役割の回数がそろう（4回を2人で2回ずつ）', balanced);
}
{
  // その役割ができるのが1人だけなら、全部の回でその人
  const users = [
    { userId: 'a', dayRoles: ['PC'], trainingRoles: [] },
    { userId: 'b', dayRoles: ['受付'], trainingRoles: [] },
  ];
  const subs = users.map((u) => ({ userId: u.userId, available: true }));
  const reqs = [1, 2, 3].map((session) => ({ session, role: 'PC', requiredCount: 1 }));
  const r = assignRolesBySession('day', 3, reqs, subs, users);
  check(
    '代わりがいなければ同じ人が続ける・役割の無い回は役割なし',
    ['a', 'b'].map((u) =>
      r
        .filter((x) => x.userId === u)
        .sort((x, y) => x.session - y.session)
        .map((x) => x.role)
    ),
    [
      ['PC', 'PC', 'PC'],
      ['役割なし', '役割なし', '役割なし'],
    ]
  );
}
{
  // 必要人数は回ごと。2回目だけ受付2
  const users = ['a', 'b', 'c'].map((userId) => ({ userId, dayRoles: ['受付'], trainingRoles: [] }));
  const subs = users.map((u) => ({ userId: u.userId, available: true }));
  const reqs = [
    { session: 1, role: '受付', requiredCount: 1 },
    { session: 2, role: '受付', requiredCount: 2 },
  ];
  const r = assignRolesBySession('day', 2, reqs, subs, users);
  check(
    '回ごとの必要人数を使う',
    [1, 2].map((s) => r.filter((x) => x.session === s && x.role === '受付').length),
    [1, 2]
  );
  const one = assignRolesBySession('day', 1, [{ session: 1, role: '受付', requiredCount: 1 }], subs, users);
  ok('回数1の枠は全員1回目の1行だけ', one.length === 3 && one.every((x) => x.session === 1));
}
{
  const { validateSessionAssignments, rolesSummary, groupRolesByUser } = await load('src/lib/session-roles.ts');
  const full = [
    { userId: 'a', session: 1, role: '受付' },
    { userId: 'a', session: 2, role: 'PC' },
  ];
  check('回の検証: 全部の回があれば OK', validateSessionAssignments(full, 2), null);
  check('回の検証: 抜けた回がある', validateSessionAssignments(full.slice(0, 1), 2), '全部の回の役割を決めてください');
  check(
    '回の検証: 同じ回が2つ',
    validateSessionAssignments([...full, { userId: 'a', session: 2, role: '受付' }], 2),
    '同じ人が同じ回に2回入っています'
  );
  check('回の検証: 回数より後ろの回', validateSessionAssignments(full, 1), 'この枠に無い回が入っています');
  check('表記: 全回同じ', rolesSummary(['受付', '受付']), '役割: 受付');
  check('表記: 全回役割なし', rolesSummary(['役割なし']), '役割の指定なし');
  check(
    'まとめ: 回の順に並べる（session が無い行は1回目）',
    [...groupRolesByUser([{ userId: 'a', session: 2, role: 'PC' }, { userId: 'a', role: '受付' }])],
    [['a', ['受付', 'PC']]]
  );
}

// ===== 日付・期限 ===========================================================
console.log('\n■ 日付・期限（src/lib/datetime.ts）');

check('期限 = 日付の14日前 23:59:59 JST', computeDeadline('2026-04-03'), '2026-03-20T23:59:59+09:00');
check('月をまたぐ', computeDeadline('2026-03-01'), '2026-02-15T23:59:59+09:00');
check('年をまたぐ', computeDeadline('2026-01-05'), '2025-12-22T23:59:59+09:00');
check('うるう年の2月を含む', computeDeadline('2028-03-01'), '2028-02-16T23:59:59+09:00');

// 期限は管理画面で動かせる（既定は14日前のまま）
check('何日前かを指定できる（7日前）', computeDeadline('2026-04-03', 7), '2026-03-27T23:59:59+09:00');
check('0日前 = シフト当日の 23:59:59', computeDeadline('2026-04-03', 0), '2026-04-03T23:59:59+09:00');
check('期限日から期限を作る', deadlineFromDate('2026-10-02'), '2026-10-02T23:59:59+09:00');
check('期限の JST の日付（+09:00 表記）', deadlineDateJst('2026-10-02T23:59:59+09:00'), '2026-10-02');
check('期限の JST の日付（DB が返す UTC 表記でも同じ日）', deadlineDateJst('2026-10-02T14:59:59+00:00'), '2026-10-02');
check('期限の表示（UTC 表記でも JST の日時で出す）', formatDeadlineJst('2026-10-02T14:59:59+00:00'), '10/2(金) 23:59');
check('日付の表示（今年は年なし）', formatDateJa('2026-11-24', '2026-01-01'), '11/24(火)');
check('日付の表示（別の年は年つき）', formatDateJa('2027-04-05', '2026-12-31'), '2027/4/5(月)');
check('日時の表示', formatDateTimeJst('2026-11-24T01:05:00+00:00'), '11/24(火) 10:05');
check('時間帯の表示', formatTimeRange('13:00:00', '16:30'), '13:00〜16:30');
check('日付を足す（月またぎ）', addDays('2026-01-30', 3), '2026-02-02');
check('日数差', daysBetween('2026-10-02', '2026-10-10'), 8);
check('日数差（逆向きは負）', daysBetween('2026-10-10', '2026-10-02'), -8);
check('実在しない日付は弾く', [isRealDate('2026-02-31'), isRealDate('2026-13-01'), isRealDate('2028-02-29')], [false, false, true]);

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

// ===== 欠席連絡（提出期限後） ===============================================
console.log('\n■ 欠席連絡（src/lib/absence.ts）');
{
  const {
    slotStartMs,
    absenceWindow,
    isAbsenceEligible,
    formatSlotDateJa,
    buildAbsenceMessage,
    buildAbsenceCancelMessage,
  } = await load('src/lib/absence.ts');

  const slot = {
    date: '2026-11-10',
    start_time: '13:00:00',
    end_time: '16:00:00',
    deadline: '2026-11-03T23:59:59+09:00',
    slot_type: 'day',
    title: '入学式',
  };
  const at = (iso) => new Date(iso).getTime();

  check('開始時刻は JST', new Date(slotStartMs(slot)).toISOString(), '2026-11-10T04:00:00.000Z');
  check('開始時刻: HH:MM でも同じ', slotStartMs({ ...slot, start_time: '13:00' }), slotStartMs(slot));
  check('期限前は連絡しない（×に変える）', absenceWindow(slot, at('2026-11-03T23:59:00+09:00')), 'before_deadline');
  check('期限ちょうどはまだ期限前', absenceWindow(slot, at('2026-11-03T23:59:59+09:00')), 'before_deadline');
  check('期限を過ぎたら連絡できる', absenceWindow(slot, at('2026-11-04T00:00:00+09:00')), 'open');
  check('当日の開始1分前まで連絡できる', absenceWindow(slot, at('2026-11-10T12:59:00+09:00')), 'open');
  check('開始時刻ちょうどで締め切り', absenceWindow(slot, at('2026-11-10T13:00:00+09:00')), 'started');
  check(
    '期限が開始より後の枠（DB 直書きなど）でも開始後は started',
    absenceWindow({ ...slot, deadline: '2026-11-11T23:59:59+09:00' }, at('2026-11-10T14:00:00+09:00')),
    'started'
  );

  check('○で提出 → 出せる', isAbsenceEligible({ submittedAvailable: true, publishedAssigned: false }), true);
  check('×で提出・割り振りなし → 出せない', isAbsenceEligible({ submittedAvailable: false, publishedAssigned: false }), false);
  check('未提出・割り振りなし → 出せない', isAbsenceEligible({ submittedAvailable: null, publishedAssigned: false }), false);
  check('×でも確定済みの割り振りあり → 出せる', isAbsenceEligible({ submittedAvailable: false, publishedAssigned: true }), true);

  check('日付の表記', formatSlotDateJa('2026-11-10'), '11/10(火)');
  check(
    '欠席連絡の文面（役割あり）',
    buildAbsenceMessage({ name: '山田', slot, roles: ['受付'], reason: '体調不良のため' }),
    [
      '【欠席連絡】山田さん',
      '11/10(火) 13:00〜16:00 当日 入学式',
      '役割: 受付',
      '理由: 体調不良のため',
      '',
      'アプリの「欠席連絡」で一覧を見られます。割り振りの調整が必要なら対応してください。',
    ].join('\n')
  );
  ok(
    '欠席連絡の文面（未確定の枠は役割の行を出さない）',
    !buildAbsenceMessage({ name: '山田', slot: { ...slot, title: null }, roles: null, reason: 'x' }).includes('役割')
  );
  ok(
    '欠席連絡の文面（役割なしで出勤）',
    buildAbsenceMessage({ name: '山田', slot, roles: ['役割なし', '役割なし'], reason: 'x' }).includes('役割: 指定なし（出勤のみ）')
  );
  ok(
    '欠席連絡の文面（回で役割が違う）',
    buildAbsenceMessage({ name: '山田', slot, roles: ['加入', '受付'], reason: 'x' }).includes('役割: 1回目「加入」・2回目「受付」')
  );
  ok(
    '取り消しの文面',
    buildAbsenceCancelMessage({ name: '山田', slot }).startsWith(
      '【欠席連絡の取り消し】山田さん\n11/10(火) 13:00〜16:00 当日 入学式\n'
    )
  );
}

// ===== 公開後の差し替え =====================================================
console.log('\n■ 割り振りの差分と文面（src/lib/assignment-change.ts）');
{
  const { diffAssignments, hasChanges, slotWhen, confirmedMessage, removedMessage, roleChangedMessage } =
    await load('src/lib/assignment-change.ts');

  const before = [
    { userId: 'a', role: '受付' },
    { userId: 'b', role: 'アテンド' },
    { userId: 'c', role: 'PC' },
  ];
  const after = [
    { userId: 'a', role: '受付' }, // 変わらない
    { userId: 'b', role: '受付' }, // 役割変更
    { userId: 'd', role: 'PC' }, // 追加（c の代役）
  ];
  check('差分: 追加・外す・役割変更', diffAssignments(before, after), {
    added: [{ userId: 'd', roles: ['PC'] }],
    removed: [{ userId: 'c', roles: ['PC'] }],
    changed: [{ userId: 'b', from: ['アテンド'], to: ['受付'] }],
  });
  // 1日の中の回（migration 013）: 人ごとに回の順で比べる。行の並びには左右されない
  const beforeS = [
    { userId: 'a', session: 2, role: '受付' },
    { userId: 'a', session: 1, role: '加入' },
    { userId: 'b', session: 1, role: 'PC' },
    { userId: 'b', session: 2, role: 'PC' },
  ];
  const afterS = [
    { userId: 'a', session: 1, role: '加入' },
    { userId: 'a', session: 2, role: '受付' },
    { userId: 'b', session: 1, role: 'PC' },
    { userId: 'b', session: 2, role: 'アテンド' },
  ];
  check('差分（回あり）: 1つの回だけ変わっても役割変更', diffAssignments(beforeS, afterS), {
    added: [],
    removed: [],
    changed: [{ userId: 'b', from: ['PC', 'PC'], to: ['PC', 'アテンド'] }],
  });
  check('差分（回あり）: 行の並びが違うだけなら変更なし', hasChanges(diffAssignments(beforeS, [...beforeS].reverse())), false);
  check('差分: 変わらない人は入らない', hasChanges(diffAssignments(before, [...before].reverse())), false);
  check('差分: 全員外す', diffAssignments(before, []).removed.length, 3);

  const when = slotWhen({ date: '2026-11-10', start_time: '13:00:00', end_time: '16:00:00', title: '入学式' });
  check('枠の書き方', when, '2026-11-10 13:00〜16:00 入学式');
  check(
    '枠の書き方（タイトルなし）',
    slotWhen({ date: '2026-11-10', start_time: '13:00:00', end_time: '16:00:00', title: null }),
    '2026-11-10 13:00〜16:00'
  );
  check('確定の文面（公開時と同じ）', confirmedMessage(when, ['受付']), 'シフト確定: 2026-11-10 13:00〜16:00 入学式 あなたの役割は「受付」です');
  check('確定の文面（役割なし）', confirmedMessage(when, ['役割なし']), 'シフト確定: 2026-11-10 13:00〜16:00 入学式 出勤です（役割の指定はありません）');
  check('外れた文面', removedMessage(when), 'シフト変更: 2026-11-10 13:00〜16:00 入学式 のシフトから外れました（出勤しなくて大丈夫です）');
  check('役割変更の文面', roleChangedMessage(when, ['アテンド'], ['受付']), 'シフト変更: 2026-11-10 13:00〜16:00 入学式 あなたの役割が「アテンド」から「受付」に変わりました');
  check('役割変更の文面（役割なしへ）', roleChangedMessage(when, ['受付'], ['役割なし']), 'シフト変更: 2026-11-10 13:00〜16:00 入学式 あなたの役割が「受付」から役割の指定なしに変わりました');
  check(
    '確定の文面（回で役割が違う）',
    confirmedMessage(when, ['加入', '受付', '受付', 'アテンド']),
    'シフト確定: 2026-11-10 13:00〜16:00 入学式 あなたの役割は 1回目「加入」・2回目「受付」・3回目「受付」・4回目「アテンド」です'
  );
  check('確定の文面（全回同じ役割）', confirmedMessage(when, ['受付', '受付']), 'シフト確定: 2026-11-10 13:00〜16:00 入学式 あなたの役割は「受付」です');
  check(
    '確定の文面（一部の回だけ役割なし）',
    confirmedMessage(when, ['受付', '役割なし']),
    'シフト確定: 2026-11-10 13:00〜16:00 入学式 あなたの役割は 1回目「受付」・2回目 指定なし です'
  );
  check(
    '役割変更の文面（回で違う）',
    roleChangedMessage(when, ['PC', 'PC'], ['PC', 'アテンド']),
    'シフト変更: 2026-11-10 13:00〜16:00 入学式 あなたの役割が変わりました。変更後: 1回目「PC」・2回目「アテンド」'
  );
}

console.log('\n■ シフトのカレンダー（src/lib/calendar.ts）');
{
  const { buildCalendarEntries, summarizeByDate, monthGrid, addMonths } = await load('src/lib/calendar.ts');
  const base = { start_time: '10:00:00', end_time: '12:00:00', slot_type: 'day', title: null };
  const roles = [{ ...base, slot_id: 'c1', roles: ['受付'], date: '2026-04-06' }];
  const slots = [
    { ...base, id: 'c1', date: '2026-04-06', expired: true, submission: { available: true }, absence: { reason: 'x' } },
    { ...base, id: 'o1', date: '2026-04-08', expired: false, submission: { available: true } },
    { ...base, id: 'u1', date: '2026-04-09', expired: false, submission: null },
    { ...base, id: 'x1', date: '2026-04-10', expired: false, submission: { available: false } },
    { ...base, id: 'e1', date: '2026-04-11', expired: true, submission: null },
    { ...base, id: 'u2', date: '2026-04-08', start_time: '09:00:00', expired: false, submission: null },
  ];
  const entries = buildCalendarEntries(roles, slots);
  check('カレンダー: 塗る枠（× と期限切れ未回答は出さない）', entries.map((e) => `${e.slotId}:${e.status}`), [
    'c1:confirmed',
    'u2:unanswered',
    'o1:available',
    'u1:unanswered',
  ]);
  check('カレンダー: 確定の役割と欠席連絡', [entries[0].roles, entries[0].absence], [['受付'], true]);
  const sum = summarizeByDate(entries);
  check('カレンダー: 同じ日は強い方（○ > 未回答）・件数', sum.get('2026-04-08'), { status: 'available', count: 2, absence: false });
  check('カレンダー: 何もない日は無い', sum.has('2026-04-10'), false);
  const grid = monthGrid(2026, 4);
  check('カレンダー: 2026年4月は水曜始まり（空き3つ）', grid.slice(0, 4), [null, null, null, '2026-04-01']);
  check('カレンダー: マス目は7の倍数', grid.length % 7, 0);
  check('カレンダー: 2月（うるう年）', monthGrid(2028, 2).filter(Boolean).length, 29);
  check('カレンダー: 月を足す（年またぎ）', [addMonths(2026, 12, 1), addMonths(2026, 1, -1)], [
    { year: 2027, month: 1 },
    { year: 2025, month: 12 },
  ]);
}

console.log(failed === 0 ? '\n=> 全項目 OK' : `\n=> ${failed} 件失敗`);
process.exit(failed === 0 ? 0 : 1);
