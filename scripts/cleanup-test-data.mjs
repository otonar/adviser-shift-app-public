// テストデータの棚卸しと削除。
//
// 使い方:
//   node --env-file=.env.local scripts/cleanup-test-data.mjs          … 見るだけ（既定）
//   node --env-file=.env.local scripts/cleanup-test-data.mjs --apply  … 実際に削除する
//
// **既定では1行も消さない**。まず何が消えるのかを全部出して、目で確かめてから
// `--apply` を付けて実行する。消したものは戻せない（DB にゴミ箱は無い）。
//
// 消す対象は2種類:
//   (A) テストデータの目印が付いている行（自動判定）
//       - users    : 名前が「テスト_」で始まる（scripts/seed.mjs が入れたもの）
//       - products : 名前が「テスト_」で始まる
//       - shift_slots : note が「[seed]」で始まる
//   (B) 下の EXTRA_* に**手で書いた行**（目印が無いので人が判断したもの）
//       条件での一括指定ではなく1件ずつ書く。**一致が1件でなければ何もせず中止**する
//       ＝棚卸ししたときから DB が変わっていたら気づけるようにするため。
//
// 連鎖して消えるもの（DB の ON DELETE CASCADE）:
//   枠を消す → その枠の対象者・必要人数・希望提出・割り振りも消える
//   人を消す → その人の対象・提出・割り振りも消える
//   アンケート結果を消す → その回の回答値（survey_answers）も消える
// 連鎖では消えないので明示的に消すもの:
//   notification_logs / suggestions は user_id が NULL になって**行が残る**
//   （投稿を残すための設計）。消す人の分はゴミなので先に消す。
//
// 安全のため、このスクリプトは文字列で SQL を組み立てない（Supabase client の
// パラメータバインディングのみ）。目印の判定も LIKE ではなく JS 側で
// startsWith() する（LIKE の `_` が1文字ワイルドカードなので誤爆を避けるため）。

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    '環境変数が未設定です。次のように実行してください:\n' +
      '  node --env-file=.env.local scripts/cleanup-test-data.mjs\n' +
      '（NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要）'
  );
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

// ---- (A) 目印 -----------------------------------------------------------
const USER_PREFIX = 'テスト_';
const PRODUCT_PREFIX = 'テスト_';
const SLOT_MARKER = '[seed]';

// ---- (B) 手で選んだ追加対象 ----------------------------------------------
// 目印が無いのに消したい行を**1件ずつ**ここに書く。書いた行が1件に特定できな
// ければスクリプトは何もせず止まる（棚卸ししたときから DB が変わっていたら
// 気づけるようにするため）。
//
// **使い終わったら空に戻すこと**。一度きりの指定を残したまま次回実行すると
// 「一致0件」で止まって、目印ぶんの掃除までできなくなる。
//
// 書き方（枠は date と note の組で特定する。note が無い枠は null）:
//   const EXTRA_USER_NAMES = ['てすと太郎'];
//   const EXTRA_SLOTS = [{ date: '2026-07-04', note: 'test' }, { date: '2026-06-16', note: null }];
//   const EXTRA_SURVEYS = [{ date: '2026-08-06', title: 'テスト' }];
//
// 実績: 2026-09-24 に本番投入前の一括削除を実施（何を消したかは
// docs/DEVELOPMENT_NOTES.md の同日エントリに記録）。
const EXTRA_USER_NAMES = [];
const EXTRA_SLOTS = [];
const EXTRA_SURVEYS = [];

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchAll(table, columns) {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) throw new Error(`${table} の取得に失敗: ${error.message}`);
  return data ?? [];
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}`);
}

const jst = (iso) =>
  iso ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '—';

// EXTRA_* の1件を実際の行に対応づける。1件に決まらなければ問題として積む。
function resolveOne(rows, pred, label, problems) {
  const hits = rows.filter(pred);
  if (hits.length === 1) return hits[0];
  problems.push(`${label} → ${hits.length} 件一致（1件でないので実行しません）`);
  return null;
}

async function main() {
  console.log(APPLY ? '★ 削除モード（--apply）' : '見るだけモード（削除しません）');

  // ---- 取得（全部読んでから JS 側で判定する） ----------------------------
  const [users, products, slots, targets, submissions, assignments, suggestions, surveys, answers, logs] =
    await Promise.all([
      fetchAll('users', 'id, name, is_active, line_user_id, created_at'),
      fetchAll('products', 'id, name, stock, is_visible, created_at'),
      fetchAll('shift_slots', 'id, date, slot_type, assignment_status, note, created_at'),
      fetchAll('shift_target_users', 'shift_slot_id, user_id'),
      fetchAll('shift_submissions', 'id, shift_slot_id, user_id'),
      fetchAll('shift_assignments', 'id, shift_slot_id, user_id, role'),
      fetchAll('suggestions', 'id, user_id, category, status, created_at'),
      fetchAll('surveys', 'id, date, title, status, created_at'),
      fetchAll('survey_answers', 'id, survey_id'),
      fetchAll('notification_logs', 'id, user_id, notification_type, sent_at'),
    ]);

  // ---- 対象を決める ------------------------------------------------------
  const problems = [];

  const markedUsers = users.filter((u) => u.name.startsWith(USER_PREFIX));
  const extraUsers = EXTRA_USER_NAMES.map((name) =>
    resolveOne(users, (u) => u.name === name, `追加ユーザー「${name}」`, problems)
  ).filter(Boolean);
  const delUsers = [...markedUsers, ...extraUsers];
  const delUserIds = new Set(delUsers.map((u) => u.id));

  const delProducts = products.filter((p) => p.name.startsWith(PRODUCT_PREFIX));

  const markedSlots = slots.filter((s) => (s.note ?? '').startsWith(SLOT_MARKER));
  const extraSlots = EXTRA_SLOTS.map((t) =>
    resolveOne(
      slots,
      (s) => s.date === t.date && (s.note ?? null) === t.note,
      `追加枠 ${t.date}（note=${t.note ?? 'なし'}）`,
      problems
    )
  ).filter(Boolean);
  const delSlots = [...markedSlots, ...extraSlots];
  const delSlotIds = new Set(delSlots.map((s) => s.id));

  const delSurveys = EXTRA_SURVEYS.map((t) =>
    resolveOne(
      surveys,
      (s) => s.date === t.date && s.title === t.title,
      `追加アンケート ${t.date}「${t.title}」`,
      problems
    )
  ).filter(Boolean);
  const delSurveyIds = new Set(delSurveys.map((s) => s.id));

  const delSuggestions = suggestions.filter((s) => s.user_id && delUserIds.has(s.user_id));
  const delLogs = logs.filter((l) => l.user_id && delUserIds.has(l.user_id));

  // 連鎖で消える件数（参考表示用）
  const cascade = {
    targets: targets.filter((t) => delSlotIds.has(t.shift_slot_id) || delUserIds.has(t.user_id)).length,
    submissions: submissions.filter((s) => delSlotIds.has(s.shift_slot_id) || delUserIds.has(s.user_id)).length,
    assignments: assignments.filter((a) => delSlotIds.has(a.shift_slot_id) || delUserIds.has(a.user_id)).length,
    answers: answers.filter((a) => delSurveyIds.has(a.survey_id)).length,
  };

  // ---- 現状 --------------------------------------------------------------
  section('いま DB に入っている件数');
  for (const [label, n] of [
    ['users（メンバー）', users.length],
    ['products（商品）', products.length],
    ['shift_slots（シフト枠）', slots.length],
    ['shift_target_users（対象者）', targets.length],
    ['shift_submissions（希望提出）', submissions.length],
    ['shift_assignments（割り振り）', assignments.length],
    ['suggestions（目安箱）', suggestions.length],
    ['surveys（アンケート結果）', surveys.length],
    ['survey_answers（回答値）', answers.length],
    ['notification_logs（通知ログ）', logs.length],
  ]) {
    console.log(`  ${label.padEnd(30, '　')} ${String(n).padStart(5)} 件`);
  }

  // ---- 消す対象 ----------------------------------------------------------
  section(`消すメンバー ${delUsers.length} 名`);
  for (const u of delUsers) {
    const mark = u.name.startsWith(USER_PREFIX) ? '目印' : '手選択';
    console.log(
      `  [${mark}] ${u.name.padEnd(14, '　')} LINE連携=${u.line_user_id ? '有' : '無'} ` +
        `提出${submissions.filter((s) => s.user_id === u.id).length} ` +
        `割振${assignments.filter((a) => a.user_id === u.id).length} ` +
        `目安箱${suggestions.filter((s) => s.user_id === u.id).length}`
    );
  }

  section(`消すシフト枠 ${delSlots.length} 件`);
  for (const s of delSlots) {
    const mark = (s.note ?? '').startsWith(SLOT_MARKER) ? '目印' : '手選択';
    console.log(
      `  [${mark}] ${s.date} ${s.slot_type === 'day' ? '当日' : '研修'} ${s.assignment_status.padEnd(9)} ` +
        `提出${submissions.filter((x) => x.shift_slot_id === s.id).length} ` +
        `割振${assignments.filter((x) => x.shift_slot_id === s.id).length}  note=${s.note ?? '（なし）'}`
    );
  }

  section(`消す商品 ${delProducts.length} 件 / アンケート結果 ${delSurveys.length} 件`);
  for (const p of delProducts) console.log(`  [目印] ${p.name}`);
  for (const s of delSurveys) console.log(`  [手選択] ${s.date} ${s.title}（${s.status}）`);

  section('消す付随データ');
  console.log(`  目安箱の投稿（消す人の分）   ${delSuggestions.length} 件`);
  console.log(`  通知ログ（消す人の分）       ${delLogs.length} 件`);
  console.log(`  ↓ ここから下は連鎖で自動的に消えるぶん`);
  console.log(`  対象者                       ${cascade.targets} 件`);
  console.log(`  希望提出                     ${cascade.submissions} 件`);
  console.log(`  割り振り                     ${cascade.assignments} 件`);
  console.log(`  アンケートの回答値           ${cascade.answers} 件`);

  // ---- 残るもの ----------------------------------------------------------
  section('★ 残るもの（これが消えていたら何かおかしい）');
  const keepUsers = users.filter((u) => !delUserIds.has(u.id));
  console.log(`\n  [メンバー] ${keepUsers.length} 名`);
  for (const u of keepUsers)
    console.log(`    ${u.name.padEnd(14, '　')} LINE連携=${u.line_user_id ? '有' : '無'}  作成=${jst(u.created_at)}`);
  const keepSlots = slots.filter((s) => !delSlotIds.has(s.id));
  console.log(`\n  [シフト枠] ${keepSlots.length} 件`);
  for (const s of keepSlots)
    console.log(
      `    ${s.date} ${s.slot_type === 'day' ? '当日' : '研修'} ${s.assignment_status.padEnd(9)} ` +
        `提出${submissions.filter((x) => x.shift_slot_id === s.id).length}  note=${s.note ?? '（なし）'}`
    );
  const keepProducts = products.filter((p) => !p.name.startsWith(PRODUCT_PREFIX));
  console.log(`\n  [商品] ${keepProducts.length} 件`);
  for (const p of keepProducts) console.log(`    ${p.name}（在庫${p.stock}・表示=${p.is_visible ? '○' : '×'}）`);
  const keepSurveys = surveys.filter((s) => !delSurveyIds.has(s.id));
  console.log(`\n  [アンケート結果] ${keepSurveys.length} 件`);
  for (const s of keepSurveys) console.log(`    ${s.date} ${s.title}（${s.status}）`);
  const keepSuggestions = suggestions.filter((s) => !delSuggestions.includes(s));
  console.log(`\n  [目安箱] ${keepSuggestions.length} 件`);
  console.log(`  [通知ログ] ${logs.length - delLogs.length} 件`);

  // ---- 中止条件 ----------------------------------------------------------
  if (problems.length > 0) {
    section('⚠ 実行できません（手で指定した行が特定できない）');
    for (const p of problems) console.log(`  ${p}`);
    console.log(
      '\n  棚卸しのときから DB が変わっている可能性があります。' +
        '\n  スクリプト上部の EXTRA_* を今の DB に合わせて直してください。'
    );
    process.exit(1);
  }

  const total =
    delUsers.length + delProducts.length + delSlots.length + delSurveys.length +
    delSuggestions.length + delLogs.length;

  if (!APPLY) {
    section('まとめ');
    console.log(`  直接消す行: 合計 ${total} 件（＋連鎖で消えるぶんが上記）`);
    console.log('  実際に消すには --apply を付けて実行する:');
    console.log('    node --env-file=.env.local scripts/cleanup-test-data.mjs --apply');
    return;
  }

  if (total === 0) {
    section('削除対象がありません');
    return;
  }

  // ---- 実行 --------------------------------------------------------------
  section('削除を実行します');
  const del = async (label, table, ids) => {
    if (ids.length === 0) return console.log(`  ${label}: 0 件（対象なし）`);
    const { error, count } = await supabase.from(table).delete({ count: 'exact' }).in('id', ids);
    if (error) throw new Error(`${label} の削除に失敗: ${error.message}`);
    console.log(`  ${label}: ${count ?? ids.length} 件 削除`);
  };

  // 順番が大事。連鎖で消えない行（通知ログ・目安箱）を先に始末してから人を消す。
  await del('通知ログ', 'notification_logs', delLogs.map((l) => l.id));
  await del('目安箱の投稿', 'suggestions', delSuggestions.map((s) => s.id));
  await del('アンケート結果（回答値も連鎖）', 'surveys', delSurveys.map((s) => s.id));
  await del('シフト枠（対象者・提出・割り振りも連鎖）', 'shift_slots', delSlots.map((s) => s.id));
  await del('商品', 'products', delProducts.map((p) => p.id));
  await del('メンバー（対象・提出・割り振りも連鎖）', 'users', delUsers.map((u) => u.id));

  // ---- 後確認 ------------------------------------------------------------
  section('削除後の確認（もう一度 DB を読み直す）');
  const [u2, p2, s2, sub2, asg2, tgt2, sv2, ans2, sug2, log2] = await Promise.all([
    fetchAll('users', 'id, name'),
    fetchAll('products', 'id, name'),
    fetchAll('shift_slots', 'id, date, note'),
    fetchAll('shift_submissions', 'id'),
    fetchAll('shift_assignments', 'id'),
    fetchAll('shift_target_users', 'user_id'),
    fetchAll('surveys', 'id, title'),
    fetchAll('survey_answers', 'id'),
    fetchAll('suggestions', 'id'),
    fetchAll('notification_logs', 'id'),
  ]);
  const leftovers = [
    ['名前が「テスト_」のメンバー', u2.filter((x) => x.name.startsWith(USER_PREFIX)).length],
    ['手で選んだメンバー', u2.filter((x) => EXTRA_USER_NAMES.includes(x.name)).length],
    ['名前が「テスト_」の商品', p2.filter((x) => x.name.startsWith(PRODUCT_PREFIX)).length],
    ['note が「[seed]」の枠', s2.filter((x) => (x.note ?? '').startsWith(SLOT_MARKER)).length],
    ['手で選んだ枠', s2.filter((x) => EXTRA_SLOTS.some((t) => t.date === x.date && (x.note ?? null) === t.note)).length],
    ['手で選んだアンケート', sv2.filter((x) => EXTRA_SURVEYS.some((t) => t.title === x.title)).length],
  ];
  for (const [label, n] of leftovers)
    console.log(`  ${label.padEnd(28, '　')} ${n} 件${n === 0 ? ' ✓' : ' ← 残っている'}`);
  console.log(
    `\n  残り: メンバー ${u2.length} 名 / 商品 ${p2.length} 件 / 枠 ${s2.length} 件 / 対象者 ${tgt2.length} 件 / ` +
      `提出 ${sub2.length} 件 / 割り振り ${asg2.length} 件 / アンケート ${sv2.length} 件（回答値 ${ans2.length}）/ ` +
      `目安箱 ${sug2.length} 件 / 通知ログ ${log2.length} 件`
  );
  console.log('\n  残った枠:');
  for (const s of s2) console.log(`    ${s.date}  note=${s.note ?? '（なし）'}`);
}

main().catch((e) => {
  console.error('\n失敗:', e.message);
  process.exit(1);
});
