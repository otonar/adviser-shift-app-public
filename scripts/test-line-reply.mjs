// LINE のトークへの返事（src/lib/line-reply.ts）の回帰テスト。
//
//   npm run test:line      （npm test でほかのテストと一緒に走る）
//
// なぜこれがあるのか:
//   Webhook の返事は、実際に LINE から送ってみないと目に入らない。しかも本番の公式アカウントで
//   試すと実メンバーのトークと同じ場所で動く。文面の組み立ては DB にも LINE にも触らない
//   純粋関数に分けてあるので、ここで「どの言葉に反応するか」「何が書かれるか」を固定する。
//
// 読み込み方は test-shift-logic.mjs と同じ（esbuild でその場でバンドル）。

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

const {
  detectCommand,
  externalUrl,
  buildNextShiftsReply,
  buildPendingSlotsReply,
  buildHelpReply,
  buildUnlinkedReply,
  buildAmbiguousReply,
} = await load('src/lib/line-reply.ts');

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

const APP = 'https://example.test';
const TODAY = '2026-10-01'; // 木曜

// ===== どの言葉に反応するか ==================================================
console.log('\n■ 言葉の判定（detectCommand）');

check('リッチメニュー: 直近のシフト', detectCommand('直近のシフト'), 'next_shifts');
check('リッチメニュー: 未提出の枠', detectCommand('未提出の枠'), 'pending_slots');
check('手打ち: シフト', detectCommand('シフト'), 'next_shifts');
check('手打ち: 未提出', detectCommand('未提出'), 'pending_slots');
check('前後・途中の空白は無視', detectCommand('  直近の シフト\n'), 'next_shifts');
check('全角英字・大文字でもヘルプ', detectCommand('ＨＥＬＰ'), 'help');
check('全角の？でもヘルプ', detectCommand('？'), 'help');
// 知らない言葉には返事をしない（人が返す問い合わせの邪魔をしない）
check('普通の問い合わせには反応しない', detectCommand('明日のシフトって何時からですか'), null);
check('部分一致では反応しない', detectCommand('シフトについて質問です'), null);
check('空文字には反応しない', detectCommand('   '), null);

// ===== URL ===================================================================
console.log('\n■ アプリへのリンク（externalUrl）');

check(
  '外部ブラウザで開く指定が付く',
  externalUrl(APP, '/dashboard/shifts'),
  'https://example.test/dashboard/shifts?openExternalBrowser=1'
);
check(
  '末尾スラッシュ付きのアプリ URL でも二重にならない',
  externalUrl('https://example.test/', '/dashboard'),
  'https://example.test/dashboard?openExternalBrowser=1'
);

// ===== 直近のシフト ===========================================================
console.log('\n■ 直近のシフト（buildNextShiftsReply）');

{
  const roles = [
    { role: '受付', date: '2026-09-20', start_time: '09:00:00', end_time: '12:00:00', slot_type: 'day' }, // 過去
    { role: 'PC', date: '2026-10-10', start_time: '13:00:00', end_time: '16:00:00', slot_type: 'training' },
    { role: '役割なし', date: '2026-10-03', start_time: '09:00:00', end_time: '12:00:00', slot_type: 'training' },
    { role: '共済', date: TODAY, start_time: '10:00:00', end_time: '15:00:00', slot_type: 'day' }, // 今日
  ];
  const text = buildNextShiftsReply(roles, TODAY, APP);
  const lines = text.split('\n');
  ok('過去のシフトは出さない', !text.includes('9/20'), text);
  ok('今日の分は【今日】付きで先頭', lines[1].startsWith('・【今日】10/1(木) 10:00〜15:00（当日）'), lines[1]);
  ok('近い順（10/3 が 10/10 より先）', text.indexOf('10/3') < text.indexOf('10/10'), text);
  ok('役割なしは「役割の指定なし」と書く', text.includes('役割の指定なし') && !text.includes('役割: 役割なし'), text);
  ok('研修の表示名', text.includes('10/10(土) 13:00〜16:00（研修）'), text);
  ok('役割の一覧へのリンク', text.endsWith(`${APP}/dashboard/my-roles?openExternalBrowser=1`), text);
  ok('3件以下なら「ほか」は出ない', !text.includes('ほか'), text);
}

{
  const many = ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'].map((date) => ({
    role: 'PC',
    date,
    start_time: '09:00:00',
    end_time: '12:00:00',
    slot_type: 'day',
  }));
  const text = buildNextShiftsReply(many, TODAY, APP);
  ok('4件以上は3件まで＋「ほか 2 件」', text.includes('ほか 2 件') && !text.includes('10/5'), text);
}

{
  const text = buildNextShiftsReply(
    [{ role: '受付', date: '2026-09-20', start_time: '09:00:00', end_time: '12:00:00', slot_type: 'day' }],
    TODAY,
    APP
  );
  ok('これからのシフトが無ければ「ありません」', text.includes('確定しているこれからのシフトはありません'), text);
}

// ===== 未提出の枠 =============================================================
console.log('\n■ 未提出の枠（buildPendingSlotsReply）');

{
  // 締切は「日付の14日前 23:59:59 JST」＝ ISO では UTC の 14:59:59
  const slots = [
    { date: '2026-10-17', start_time: '09:00:00', end_time: '12:00:00', slot_type: 'day', deadline: '2026-10-03T14:59:59.000Z' },
    { date: '2026-10-15', start_time: '09:00:00', end_time: '12:00:00', slot_type: 'training', deadline: '2026-10-01T14:59:59.000Z' },
    { date: '2026-10-16', start_time: '13:00:00', end_time: '17:00:00', slot_type: 'day', deadline: '2026-10-02T14:59:59.000Z' },
  ];
  const text = buildPendingSlotsReply(slots, TODAY, APP);
  ok('件数を見出しに出す', text.startsWith('【未提出の枠】3 件'), text);
  ok('締切が近い順（10/15 → 10/16 → 10/17）', text.indexOf('10/15') < text.indexOf('10/16') && text.indexOf('10/16') < text.indexOf('10/17'), text);
  ok('締切が今日なら「今日まで！」（JST の暦日で判定）', text.includes('締切 10/1(木)（今日まで！）'), text);
  ok('締切が明日なら「明日まで」', text.includes('締切 10/2(金)（明日まで）'), text);
  ok('それ以降は「あと N 日」', text.includes('締切 10/3(土)（あと2日）'), text);
  ok('提出画面へのリンク', text.endsWith(`${APP}/dashboard/shifts?openExternalBrowser=1`), text);
}

{
  const text = buildPendingSlotsReply([], TODAY, APP);
  check('未提出が無ければその旨だけ', text, '【未提出の枠】\n今、希望を出す必要のある枠はありません。');
}

// ===== そのほかの返事 =========================================================
console.log('\n■ そのほかの返事');

{
  const help = buildHelpReply(APP);
  // ヘルプに書いた言葉は、実際に反応する言葉でなければならない
  const quoted = [...help.matchAll(/「(.+?)」/g)].map((m) => m[1]);
  ok('ヘルプに書いた言葉がすべて反応する', quoted.length > 0 && quoted.every((w) => detectCommand(w) !== null), quoted.join(' / '));
}
ok('未連携の人には設定画面へのリンク', buildUnlinkedReply(APP).endsWith(`${APP}/dashboard/settings?openExternalBrowser=1`));
ok('複数連携の人にも設定画面へのリンク', buildAmbiguousReply(APP).endsWith(`${APP}/dashboard/settings?openExternalBrowser=1`));
{
  const all = [
    buildNextShiftsReply([], TODAY, APP),
    buildPendingSlotsReply([], TODAY, APP),
    buildHelpReply(APP),
    buildUnlinkedReply(APP),
    buildAmbiguousReply(APP),
  ];
  // LINE のテキストメッセージは 5000 文字まで
  ok('どの返事も LINE の上限（5000字）に収まる', all.every((t) => t.length > 0 && t.length <= 5000));
}

console.log(failed === 0 ? '\n=> 全項目 OK' : `\n=> ${failed} 件失敗`);
process.exit(failed === 0 ? 0 : 1);
