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

console.log('\n.env.local に以下を設定してください:\n');
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log(`JWT_SECRET=${jwtSecret}`);
console.log('');
