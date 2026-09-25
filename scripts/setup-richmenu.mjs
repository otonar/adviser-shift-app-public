// LINE 公式アカウントのリッチメニュー（トーク画面の下に出るボタン）を作って登録するスクリプト。
//
// 使い方:
//   node scripts/setup-richmenu.mjs
//       → 画像 assets/richmenu.png を作るだけ（LINE には触らない）。見た目の確認用。
//   node --env-file=.env.local scripts/setup-richmenu.mjs --apply
//       → 画像を作り、LINE に登録して「全員のデフォルトのメニュー」にする。
//         以前このスクリプトで登録したメニューは、切り替えたあとで削除する。
//
// **ボタンの文言・並び・色を変えたいときは、このファイルの BUTTONS / COLORS を直して --apply し直すだけ**。
// LINE 公式アカウントマネージャーの画面で作らない理由は、設定がその画面の中にしか残らず
// 次の代に引き継げないため（このアプリの第一目的は脱属人化）。
//
// ⚠️ 注意
//   - 「トークで返事」のボタンは、押すとその文言がトークに送られ、Webhook（/api/line/webhook）が返事をする。
//     **文言は src/lib/line-reply.ts のキーワードと一致していなければ無反応になる**。
//     --apply の前に自動で確かめて、一致しなければ中止する。
//   - 公式アカウントマネージャーでもメニューを作れるが、Messaging API で設定したデフォルトの
//     メニューのほうが優先して表示される（マネージャー側のメニューは出なくなる）。
//   - 既にトークを開いている人は、表示が切り替わるまで少しかかることがある（トークを開き直すと出る）。
//   - アクセストークンの値は画面に出さない。
//   - 文字は実行したパソコンに入っている日本語フォントで描かれる（Windows なら游ゴシック）。
//     作った画像は assets/richmenu.png としてコミットしておき、見た目を差分で確認できるようにする。

import { build } from 'esbuild';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(root, 'assets', 'richmenu.png');
const APPLY = process.argv.includes('--apply');

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://adviser-shift-app.vercel.app';

// このスクリプトで作ったメニューの目印（削除対象の判定に使う）。LINE の画面には出ない。
const MENU_NAME_PREFIX = 'shift-app';

// 画像サイズ（LINE の規定サイズの1つ）。2×2 に等分する。
const WIDTH = 2500;
const HEIGHT = 1686;

const COLORS = {
  background: '#FFEAF6', // アプリアイコンの背景
  card: '#FFFFFF',
  accent: '#D63A6E', // アイコンの濃いローズ
  accentSoft: '#F7B3CB',
  onAccentSub: '#FFE0EC', // 濃い地の上の小さい文字（accentSoft だと読みにくい）
  text: '#3B2230',
  subText: '#8A5A70',
};

// 左上 → 右上 → 左下 → 右下 の順。
//   kind: 'reply' … 押すと text がトークに送られ、Webhook が返事をする
//   kind: 'open'  … 押すとアプリの path を LINE の中のブラウザで開く
const BUTTONS = [
  { kind: 'reply', title: '直近のシフト', caption: 'トークで返事', icon: 'calendar', text: '直近のシフト' },
  { kind: 'reply', title: '未提出の枠', caption: 'トークで返事', icon: 'clock', text: '未提出の枠' },
  { kind: 'open', title: '希望を出す', caption: 'アプリを開く', icon: 'pencil', path: '/dashboard/shifts' },
  { kind: 'open', title: 'リンク集', caption: 'アプリを開く', icon: 'link', path: '/dashboard/links' },
];

const CELL_W = WIDTH / 2;
const CELL_H = HEIGHT / 2;

function cellOrigin(i) {
  return { x: (i % 2) * CELL_W, y: Math.floor(i / 2) * CELL_H };
}

// ---- アイコン（絵文字は画像化の環境で化けるので図形で描く）。中心 (0,0)・約 200px 四方 ----
function iconSvg(name, color) {
  const s = `stroke="${color}" stroke-width="18" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  switch (name) {
    case 'calendar':
      return `
        <rect x="-95" y="-80" width="190" height="175" rx="26" ${s}/>
        <line x1="-95" y1="-25" x2="95" y2="-25" ${s}/>
        <line x1="-45" y1="-110" x2="-45" y2="-55" ${s}/>
        <line x1="45" y1="-110" x2="45" y2="-55" ${s}/>
        <circle cx="-40" cy="25" r="13" fill="${color}"/>
        <circle cx="10" cy="25" r="13" fill="${color}"/>
        <circle cx="-40" cy="65" r="13" fill="${color}"/>`;
    case 'clock':
      return `
        <circle cx="0" cy="0" r="100" ${s}/>
        <line x1="0" y1="0" x2="0" y2="-58" ${s}/>
        <line x1="0" y1="0" x2="44" y2="30" ${s}/>`;
    case 'pencil':
      return `
        <g transform="rotate(45)">
          <rect x="-28" y="-115" width="56" height="170" rx="10" ${s}/>
          <polyline points="-28,55 0,110 28,55" ${s}/>
          <line x1="-28" y1="-75" x2="28" y2="-75" ${s}/>
        </g>`;
    case 'link':
      return `
        <g transform="rotate(-45)">
          <rect x="-105" y="-38" width="120" height="76" rx="38" ${s}/>
          <rect x="-15" y="-38" width="120" height="76" rx="38" ${s}/>
        </g>`;
    default:
      throw new Error(`unknown icon: ${name}`);
  }
}

function escapeXml(text) {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function buildSvg() {
  const pad = 36; // カードどうしの隙間の半分
  const cards = BUTTONS.map((b, i) => {
    const { x, y } = cellOrigin(i);
    const filled = b.kind === 'open';
    const cardFill = filled ? COLORS.accent : COLORS.card;
    const fg = filled ? COLORS.card : COLORS.accent;
    const title = filled ? COLORS.card : COLORS.text;
    const caption = filled ? COLORS.onAccentSub : COLORS.subText;
    const cx = x + CELL_W / 2;
    return `
      <rect x="${x + pad}" y="${y + pad}" width="${CELL_W - pad * 2}" height="${CELL_H - pad * 2}"
            rx="56" fill="${cardFill}" ${filled ? '' : `stroke="${COLORS.accentSoft}" stroke-width="6"`}/>
      <g transform="translate(${cx} ${y + 285})">${iconSvg(b.icon, fg)}</g>
      <text x="${cx}" y="${y + 560}" font-size="118" font-weight="700" fill="${title}"
            text-anchor="middle">${escapeXml(b.title)}</text>
      <text x="${cx}" y="${y + 675}" font-size="62" font-weight="500" fill="${caption}"
            text-anchor="middle">${escapeXml(b.caption)}</text>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <style>text { font-family: 'Yu Gothic UI', 'Yu Gothic', 'Meiryo', 'Hiragino Sans', 'Noto Sans CJK JP', 'Noto Sans JP', sans-serif; }</style>
  <rect width="100%" height="100%" fill="${COLORS.background}"/>
  ${cards}
</svg>`;
}

// ---- 返事ボタンの文言が Webhook のキーワードと一致しているか ------------------------
async function checkReplyWords() {
  const result = await build({
    entryPoints: [join(root, 'src/lib/line-reply.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    tsconfig: join(root, 'tsconfig.json'),
    write: false,
  });
  const { detectCommand } = await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
  );
  const bad = BUTTONS.filter((b) => b.kind === 'reply' && detectCommand(b.text) === null);
  if (bad.length > 0) {
    console.error(
      `✗ 次のボタンの文言に Webhook が反応しません: ${bad.map((b) => `「${b.text}」`).join(' ')}\n` +
        '  src/lib/line-reply.ts の KEYWORDS に同じ言葉を足すか、ボタンの text を直してください。'
    );
    process.exit(1);
  }
  console.log('✓ 返事ボタンの文言はすべて Webhook のキーワードに一致');
}

// LINE の中のブラウザで開く（理由は src/lib/line-reply.ts の appLink() を参照。ここと揃えること）
function appLink(path) {
  return new URL(path, APP_URL).toString();
}

function richMenuBody() {
  return {
    size: { width: WIDTH, height: HEIGHT },
    selected: true, // トークを開いたときにメニューを開いた状態で出す
    name: `${MENU_NAME_PREFIX} ${new Date().toISOString().slice(0, 10)}`,
    chatBarText: 'メニュー',
    areas: BUTTONS.map((b, i) => {
      const { x, y } = cellOrigin(i);
      return {
        bounds: { x, y, width: CELL_W, height: CELL_H },
        action:
          b.kind === 'reply'
            ? { type: 'message', label: b.title, text: b.text }
            : { type: 'uri', label: b.title, uri: appLink(b.path) },
      };
    }),
  };
}

// ---- LINE Messaging API ------------------------------------------------------------
async function line(method, url, { json, body, contentType } = {}) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(contentType ? { 'Content-Type': contentType } : {}),
    },
    body: json ? JSON.stringify(json) : body,
  });
  const text = await res.text();
  if (!res.ok) {
    // LINE のエラー本文には秘密は含まれない（何が不正かの説明）。トークンは出さない。
    throw new Error(`${method} ${url} → ${res.status} ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function apply(png) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    console.error('✗ LINE_CHANNEL_ACCESS_TOKEN が未設定です。--env-file=.env.local を付けて実行してください。');
    process.exit(1);
  }
  const API = 'https://api.line.me/v2/bot';
  const DATA_API = 'https://api-data.line.me/v2/bot';

  const { richmenus = [] } = await line('GET', `${API}/richmenu/list`);
  const old = richmenus.filter((m) => m.name.startsWith(MENU_NAME_PREFIX));

  const body = richMenuBody();
  await line('POST', `${API}/richmenu/validate`, { json: body });
  const { richMenuId } = await line('POST', `${API}/richmenu`, { json: body });
  console.log(`✓ メニューを作成: ${richMenuId}`);

  try {
    await line('POST', `${DATA_API}/richmenu/${richMenuId}/content`, {
      body: png,
      contentType: 'image/png',
    });
    console.log('✓ 画像をアップロード');
    await line('POST', `${API}/user/all/richmenu/${richMenuId}`);
    console.log('✓ 全員のデフォルトのメニューに設定');
  } catch (err) {
    // 途中で失敗したら作りかけを消す（画像なしのメニューが残ると次回の判定がややこしくなる）
    await line('DELETE', `${API}/richmenu/${richMenuId}`).catch(() => {});
    throw err;
  }

  // 切り替えが済んでから古いものを消す（先に消すとメニューが出ない時間ができる）
  for (const m of old) {
    await line('DELETE', `${API}/richmenu/${m.richMenuId}`);
    console.log(`✓ 以前のメニューを削除: ${m.name}（${m.richMenuId}）`);
  }
  const others = richmenus.length - old.length;
  if (others > 0) {
    console.log(`ℹ このスクリプト以外で作られたメニューが ${others} 件あります（触っていません）。`);
  }
}

// ---- 実行 --------------------------------------------------------------------------
await checkReplyWords();

await sharp(Buffer.from(buildSvg()))
  .png({ compressionLevel: 9, palette: true, colors: 64 })
  .toFile(OUTPUT);
const size = statSync(OUTPUT).size;
console.log(`✓ 画像を作成: assets/richmenu.png（${WIDTH}x${HEIGHT}, ${Math.round(size / 1024)}KB）`);
if (size > 1024 * 1024) {
  console.error('✗ 画像が 1MB を超えています（LINE の上限）。色数を減らしてください。');
  process.exit(1);
}

if (APPLY) {
  await apply(readFileSync(OUTPUT));
  console.log('\n完了。LINE でトークを開き直すとメニューが出ます。');
} else {
  console.log('\n（画像を作っただけです。LINE に登録するには --apply を付けて実行）');
  console.log('ボタンの動作:');
  for (const a of richMenuBody().areas) {
    console.log(`  ${a.action.label.padEnd(8, '　')} → ${a.action.type === 'message' ? `「${a.action.text}」を送信` : a.action.uri}`);
  }
}
