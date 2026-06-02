// 管理パスワードが .env.local の ADMIN_PASSWORD_HASH と一致するか確認する補助スクリプト。
// アプリ（Next）と同じ @next/env で .env.local を読み込むので、dev サーバーと同じ判定になる。
// 使い方:
//   node scripts/verify-admin-password.mjs "確認したいパスワード"
// （ハッシュやパスワードの値は表示しない。MATCH / NO MATCH だけ出力）

import { loadEnvConfig } from '@next/env';
import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
  console.error('使い方: node scripts/verify-admin-password.mjs "パスワード"');
  process.exit(1);
}

loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

const hash = process.env.ADMIN_PASSWORD_HASH;
if (!hash) {
  console.error('ADMIN_PASSWORD_HASH を読み込めません（.env.local を確認してください）');
  process.exit(1);
}

const ok = bcrypt.compareSync(password, hash);
console.log(
  ok
    ? 'MATCH ✅ このパスワードでログインできます'
    : 'NO MATCH ❌ パスワードが一致しません'
);
