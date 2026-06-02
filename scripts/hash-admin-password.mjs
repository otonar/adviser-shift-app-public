// 管理画面パスワードの bcrypt ハッシュと、JWT_SECRET 候補を生成する補助スクリプト。
//
// 使い方:
//   node scripts/hash-admin-password.mjs "設定したい管理パスワード"
//
// 出力された ADMIN_PASSWORD_HASH と JWT_SECRET を .env.local に手動で貼り付ける。
// （このスクリプトは値を出力するだけで、ファイルには書き込まない）

import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const password = process.argv[2];
if (!password) {
  console.error('使い方: node scripts/hash-admin-password.mjs "管理パスワード"');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
const jwtSecret = randomBytes(48).toString('base64url');

// bcrypt ハッシュは '$' を含み、Next.js(@next/env) は .env.local の値の '$' を
// 変数展開してしまう（シングルクォートでも防げないことを実測で確認済み）。
// そこで .env.local 用には '$' を '\$' にエスケープした形で出力する。
const escapedHash = hash.replace(/\$/g, '\\$');
console.log('\n--- .env.local 用（$ を \\$ にエスケープ済み。1行まるごと貼り付け）---\n');
console.log(`ADMIN_PASSWORD_HASH=${escapedHash}`);
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(
  '\n--- Vercel など「環境変数UI」に直接入れる場合（エスケープ無しの生ハッシュ）---\n'
);
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log('');
