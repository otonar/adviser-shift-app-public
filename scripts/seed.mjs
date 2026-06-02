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
// ※ シフト枠は管理画面 UI から作成して作成フローも検証する想定のため投入しない。
//
// 冪等性: ユーザーは name(UNIQUE) で upsert、商品は同名のシード商品を削除してから再投入。

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

async function main() {
  console.log('シードデータを投入します…');
  const userCount = await seedUsers();
  const productCount = await seedProducts();
  console.log(`\n完了:`);
  console.log(`  ユーザー: ${userCount} 名（名前は「テスト_」で始まる）`);
  console.log(`  商品: ${productCount} 件`);
  console.log(`\nテストユーザーのログインパスワード: ${SEED_PASSWORD}`);
  console.log('（テスト専用。本番データには使わないこと）');
  console.log('\n後片付け: 名前/商品名が「テスト_」で始まる行を削除すれば元に戻せます。');
}

main().catch((e) => {
  console.error('\nシード失敗:', e.message);
  process.exit(1);
});
