// PWA アイコンを生成するスクリプト。
//
// 使い方:
//   node scripts/generate-icons.mjs      （= npm run icons）
//
// **アイコンを差し替えるときは `assets/app-icon.png`（正方形・できれば 512px 以上）を
// 置き換えて、このスクリプトを実行するだけ**。派生する画像を手作業で作らない＝
// サイズ違いだけ古いまま残る、という事故が起きないようにするためにこの形にしてある。
//
// 出力（いずれも生成物なので直接編集しないこと）:
//   public/icons/icon-192x192.png            通常表示用（purpose: any）
//   public/icons/icon-512x512.png            同上・ストア/スプラッシュ用
//   public/icons/icon-maskable-192x192.png   Android のマスク表示用（purpose: maskable）
//   public/icons/icon-maskable-512x512.png   同上
//   src/app/apple-icon.png                   iOS ホーム画面（Next が apple-touch-icon を出す）
//   src/app/icon.png                         ブラウザのタブ（favicon）
//
// maskable について: Android はアイコンを円や角丸に**切り抜く**ので、端まで絵が入って
// いると欠ける。仕様上の安全圏は中央 80% なので、絵を 80% に縮めて周りを背景色で
// 埋めたものを別途用意している（通常表示用は切り抜かれないので縮めない）。
//
// sharp は next が内部で使っているものを借りている（このリポジトリの直接依存ではない）。
// 画像を1回作るだけの開発用スクリプトなので、そのために依存を増やさない判断。
// もし将来 sharp が無くなって動かなくなったら `npm i -D sharp` を入れれば済む。

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const SOURCE = join(root, 'assets', 'app-icon.png');
const iconsDir = join(root, 'public', 'icons');
const appDir = join(root, 'src', 'app');

// マスク表示で埋める背景色。元画像の四隅の色に合わせる（淡いピンク）。
// 元画像の背景を変えたらここも変える。
const BACKGROUND = { r: 255, g: 234, b: 246, alpha: 1 };

// Android のマスクで確実に残る範囲（中央 80%）。
const SAFE_ZONE_RATIO = 0.8;

mkdirSync(iconsDir, { recursive: true });

// 減色して書き出す。この絵はフラットな塗りなので元画像と見分けがつかず、
// 512px で 170KB → 41KB になる（アイコンは Service Worker のプリキャッシュに
// 載る＝インストール時に落ちてくるので、小さいに越したことはない）。
// 写真のような画像に差し替えたときは palette を外すこと（帯状のムラが出る）。
const png = (img) => img.png({ compressionLevel: 9, palette: true, colors: 128 });

async function writeAny(size, outPath) {
  const info = await png(
    sharp(SOURCE).resize(size, size, { fit: 'cover' }).flatten({ background: BACKGROUND })
  ).toFile(outPath);
  report(outPath, info);
}

async function writeMaskable(size, outPath) {
  const inner = Math.round(size * SAFE_ZONE_RATIO);
  const pad = Math.round((size - inner) / 2);
  const resized = await sharp(SOURCE)
    .resize(inner, inner, { fit: 'cover' })
    .flatten({ background: BACKGROUND })
    .toBuffer();
  const info = await png(
    sharp(resized).extend({
      top: pad,
      bottom: size - inner - pad,
      left: pad,
      right: size - inner - pad,
      background: BACKGROUND,
    })
  ).toFile(outPath);
  report(outPath, info);
}

function report(outPath, info) {
  const rel = outPath.slice(root.length + 1).replace(/\\/g, '/');
  console.log(`wrote ${rel} (${info.width}x${info.height}, ${info.size} bytes)`);
}

const source = await sharp(SOURCE).metadata();
if (source.width !== source.height) {
  console.warn(
    `⚠ 元画像が正方形ではありません（${source.width}x${source.height}）。中央で切り取ります。`
  );
}
if (source.width < 512) {
  console.warn(`⚠ 元画像が 512px 未満です（${source.width}px）。拡大するとぼやけます。`);
}

await writeAny(192, join(iconsDir, 'icon-192x192.png'));
await writeAny(512, join(iconsDir, 'icon-512x512.png'));
await writeMaskable(192, join(iconsDir, 'icon-maskable-192x192.png'));
await writeMaskable(512, join(iconsDir, 'icon-maskable-512x512.png'));
// iOS は切り抜かず角を丸めるだけなので、通常表示用と同じ絵でよい。
await writeAny(180, join(appDir, 'apple-icon.png'));
await writeAny(32, join(appDir, 'icon.png'));
