// テスト用シードデータ投入スクリプト（実地テストの準備用）。
//
// 使い方（Node 20.6+ の --env-file で .env.local を読み込む）:
//   node --env-file=.env.local scripts/seed.mjs
//
// 必要な環境変数: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// （このスクリプトは .env.local を Node が読むだけで、内容を出力しない）
//
// 投入物:
//   - テストユーザー 12 名（当日/研修の役割を網羅。全役割に複数候補が出るよう配分）
//   - 商品 5 件（在庫0・非表示を含む）
//   - サンプルシフト枠 2 件（当日/研修）＋対象者（全12名）＋必要人数＋希望提出（○10/×2）
//     → 管理画面で「自動割り振り→公開」をすぐ試せる状態（status=open）
//
// 冪等性: ユーザーは name(UNIQUE) で upsert、商品は同名で削除→再投入、
//         シフト枠は note の '[seed]' マーカーで削除（関連は CASCADE）→再投入。

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    '環境変数が未設定です。次のように実行してください:\n' +
      '  node --env-file=.env.local scripts/seed.mjs\n' +
      '（NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要）'
  );
  process.exit(1);
}

// テスト用の共通パスワード（本番では絶対に使わないこと）。
const SEED_PASSWORD = process.env.SEED_PASSWORD || 'password123';

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 役割定義（src/types/index.ts と一致させること）
// 当日: 全体会, 受付, アテンド, PC, 共済, 学び
// 研修: コアメンバー, PC, 共済, 学び

// テストユーザー（全役割に複数候補が出るよう配分）
const USERS = [
  { name: 'テスト_田中', day: ['全体会', '受付'], training: ['コアメンバー'] },
  { name: 'テスト_佐藤', day: ['受付', 'アテンド'], training: ['PC'] },
  { name: 'テスト_鈴木', day: ['アテンド', 'PC'], training: ['共済'] },
  { name: 'テスト_高橋', day: ['PC', '共済'], training: ['学び'] },
  { name: 'テスト_伊藤', day: ['共済', '学び'], training: ['コアメンバー', 'PC'] },
  { name: 'テスト_渡辺', day: ['学び', '全体会'], training: ['PC', '共済'] },
  { name: 'テスト_山本', day: ['全体会', 'アテンド'], training: ['共済', '学び'] },
  { name: 'テスト_中村', day: ['受付', 'PC'], training: ['コアメンバー', '学び'] },
  { name: 'テスト_小林', day: ['アテンド', '共済'], training: ['PC'] },
  { name: 'テスト_加藤', day: ['PC', '学び'], training: ['共済'] },
  { name: 'テスト_吉田', day: ['全体会', '受付', 'アテンド'], training: ['コアメンバー'] },
  { name: 'テスト_山田', day: [], training: [] }, // 役割未設定のケース
];

const PRODUCTS = [
  { name: 'テスト_ノート', category: '文具', stock: 50, is_visible: true, description: 'A罫 30枚' },
  { name: 'テスト_ボールペン', category: '文具', stock: 0, is_visible: true, description: '黒・0.5mm（在庫切れ確認用）' },
  { name: 'テスト_電卓', category: '電子', stock: 12, is_visible: true, description: null },
  { name: 'テスト_USBメモリ', category: '電子', stock: 8, is_visible: true, description: '16GB' },
  { name: 'テスト_試作品', category: null, stock: 3, is_visible: false, description: '非表示確認用' },
];

async function seedUsers() {
  const password_hash = await bcrypt.hash(SEED_PASSWORD, 12);
  const rows = USERS.map((u) => ({
    name: u.name,
    password_hash,
    line_user_id: null,
    day_roles: u.day,
    training_roles: u.training,
    is_active: true,
  }));
  const { data, error } = await supabase
    .from('users')
    .upsert(rows, { onConflict: 'name' })
    .select('id');
  if (error) throw new Error(`users 投入失敗: ${error.message}`);
  return data?.length ?? 0;
}

async function seedProducts() {
  const names = PRODUCTS.map((p) => p.name);
  // 同名のシード商品を一旦削除（冪等化）
  const { error: delErr } = await supabase
    .from('products')
    .delete()
    .in('name', names);
  if (delErr) throw new Error(`products 削除失敗: ${delErr.message}`);

  const { data, error } = await supabase
    .from('products')
    .insert(PRODUCTS)
    .select('id');
  if (error) throw new Error(`products 投入失敗: ${error.message}`);
  return data?.length ?? 0;
}

// シフト枠の必要人数（src/lib/role-assignment.ts の役割定義に合わせる）
const DAY_ROLE_REQS = [
  { role: '全体会', required_count: 1 },
  { role: '受付', required_count: 2 },
  { role: 'アテンド', required_count: 2 },
  { role: 'PC', required_count: 2 },
  { role: '共済', required_count: 1 },
  { role: '学び', required_count: 1 },
];
const TRAINING_ROLE_REQS = [
  { role: 'コアメンバー', required_count: 1 },
  { role: 'PC', required_count: 1 },
  { role: '共済', required_count: 1 },
  { role: '学び', required_count: 1 },
];

// 提出期限 = (date の 14 日前) の 23:59:59 JST（src/lib/datetime.ts と同一ロジック）
function isoDeadline(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() - 14);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}T23:59:59+09:00`;
}

function futureDate(daysAhead) {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + daysAhead);
  const yy = t.getUTCFullYear();
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(t.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

async function seedShifts() {
  // 既存のシード枠を削除（note の '[seed]' マーカー。関連テーブルは ON DELETE CASCADE で消える）
  const { error: delErr } = await supabase
    .from('shift_slots')
    .delete()
    .like('note', '[seed]%');
  if (delErr) throw new Error(`shift_slots 削除失敗: ${delErr.message}`);

  // シードユーザーの id を取得（対象者・提出に使う）
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, name')
    .like('name', 'テスト_%')
    .order('name');
  if (uErr) throw new Error(`users 取得失敗: ${uErr.message}`);
  const userIds = (users ?? []).map((u) => u.id);
  if (userIds.length === 0) return { slots: 0, submissions: 0 };

  const slots = [
    {
      slot_type: 'day',
      date: futureDate(20),
      start_time: '09:00:00',
      end_time: '17:00:00',
      note: '[seed] 当日サンプル枠（自動割り振りの動作確認用）',
      reqs: DAY_ROLE_REQS,
    },
    {
      slot_type: 'training',
      date: futureDate(25),
      start_time: '13:00:00',
      end_time: '16:00:00',
      note: '[seed] 研修サンプル枠（自動割り振りの動作確認用）',
      reqs: TRAINING_ROLE_REQS,
    },
  ];

  let submissionCount = 0;
  for (const s of slots) {
    const { data: slot, error: sErr } = await supabase
      .from('shift_slots')
      .insert({
        slot_type: s.slot_type,
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
        deadline: isoDeadline(s.date),
        note: s.note,
      })
      .select('id')
      .single();
    if (sErr || !slot) throw new Error(`shift_slots 投入失敗: ${sErr?.message}`);

    await supabase.from('shift_role_requirements').insert(
      s.reqs.map((r) => ({
        shift_slot_id: slot.id,
        role: r.role,
        required_count: r.required_count,
      }))
    );
    await supabase
      .from('shift_target_users')
      .insert(userIds.map((uid) => ({ shift_slot_id: slot.id, user_id: uid })));

    // 提出: 末尾2名を×（出られない）、それ以外は○（出られる）
    const subs = userIds.map((uid, i) => ({
      user_id: uid,
      shift_slot_id: slot.id,
      available: i < userIds.length - 2,
      note: null,
    }));
    await supabase.from('shift_submissions').insert(subs);
    submissionCount += subs.length;
  }
  return { slots: slots.length, submissions: submissionCount };
}

async function main() {
  console.log('シードデータを投入します…');
  const userCount = await seedUsers();
  const productCount = await seedProducts();
  const shiftInfo = await seedShifts();
  console.log(`\n完了:`);
  console.log(`  ユーザー: ${userCount} 名（名前は「テスト_」で始まる）`);
  console.log(`  商品: ${productCount} 件`);
  console.log(
    `  サンプル枠: ${shiftInfo.slots} 件（当日/研修・status=open）、提出: ${shiftInfo.submissions} 件（各枠 ○10/×2）`
  );
  console.log(`\nテストユーザーのログインパスワード: ${SEED_PASSWORD}`);
  console.log('（テスト専用。本番データには使わないこと）');
  console.log(
    '\n後片付け: ユーザー/商品は「テスト_」で始まる行、シフト枠は note が「[seed]」で始まる行を削除（枠を消せば対象者・提出・割り振りも CASCADE で消える）。'
  );
}

main().catch((e) => {
  console.error('\nシード失敗:', e.message);
  process.exit(1);
});
