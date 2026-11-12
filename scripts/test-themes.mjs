// 着せ替え（テーマ色）の整合性テスト。
//
//   npm run test:themes
//
// 色の一覧は3か所に書いてある（src/lib/themes.ts・globals.css・migration の CHECK 制約）。
// どれかを足し忘れると「選べるのに色が変わらない」「選ぶと保存に失敗する」になるので、
// 3か所が一致していることと、ボタンの白文字・選択中タブの文字が読める濃さかを確かめる。

import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = await build({
  entryPoints: [resolve(root, 'src/lib/themes.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const { THEME_IDS, THEMES } = await import(
  'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')
);

let failed = 0;
function check(name, ok) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}

const css = readFileSync(resolve(root, 'src/app/globals.css'), 'utf8');
const sql = readFileSync(resolve(root, 'supabase/migrations/011_add_user_theme.sql'), 'utf8');

// CSS の [data-theme='x'] { --accent: r g b; ... } を読む
const vars = {};
for (const m of css.matchAll(/\[data-theme='([a-z]+)'\]\s*\{([^}]*)\}/g)) {
  const v = {};
  for (const d of m[2].matchAll(/--([a-z-]+):\s*(\d+) (\d+) (\d+)/g)) v[d[1]] = [+d[2], +d[3], +d[4]];
  vars[m[1]] = v;
}
const checkIds = [...(sql.match(/CHECK \(theme IN \(([^)]*)\)\)/)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

check('THEMES と THEME_IDS が同じ並び', JSON.stringify(THEMES.map((t) => t.id)) === JSON.stringify([...THEME_IDS]));
check('migration の CHECK 制約が THEME_IDS と一致', JSON.stringify(checkIds) === JSON.stringify([...THEME_IDS]));
check('globals.css に余分なテーマが無い', Object.keys(vars).every((k) => THEME_IDS.includes(k)));

const lum = ([r, g, b]) => {
  const c = [r, g, b].map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const WHITE = [255, 255, 255];
const GRAY500 = [107, 114, 128];

for (const t of THEMES) {
  const v = vars[t.id];
  check(`${t.id}: globals.css に3色とも定義がある`, Boolean(v?.accent && v?.['accent-soft'] && v?.page));
  if (!v?.accent) continue;
  check(`${t.id}: 見本の色（swatch）が --accent と同じ`, JSON.stringify(hex(t.swatch)) === JSON.stringify(v.accent));
  check(`${t.id}: ボタンの白文字 4.5:1 以上（${ratio(v.accent, WHITE).toFixed(2)}）`, ratio(v.accent, WHITE) >= 4.5);
  check(`${t.id}: 選択中タブの文字 4.5:1 以上（${ratio(v.accent, v['accent-soft']).toFixed(2)}）`, ratio(v.accent, v['accent-soft']) >= 4.5);
  check(`${t.id}: 背景の上の灰色文字 4.5:1 以上（${ratio(GRAY500, v.page).toFixed(2)}）`, ratio(GRAY500, v.page) >= 4.5);
}

if (failed > 0) {
  console.error(`\n${failed} 件失敗`);
  process.exit(1);
}
console.log('\nすべて OK');
