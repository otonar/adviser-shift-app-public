import 'server-only';
import { randomInt } from 'node:crypto';

// 管理者リセット用の一時パスワード生成。
// crypto.randomInt は暗号学的乱数かつモジュロバイアスが無い。
// 紛らわしい文字（0/O/1/l/I）を除いた英数字を使う（口頭・手書きで伝えやすい）。
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function generateTempPassword(length = 12): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}
