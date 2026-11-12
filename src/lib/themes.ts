// スタッフ画面の着せ替え（テーマ色）。サーバー・クライアントの両方から使う。
//
// 変わるのは「テーマ色」（ボタン・選択中のタブ・ヘッダーの線）と「背景」だけ。
// 赤（エラー）・緑（○・成功）・黄（注意）など意味のある色は変えない。
// 実際の色は globals.css の [data-theme=…] に CSS 変数で書いてある。
//
// 色を足すときは: ① ここの THEMES ② globals.css ③ migration の CHECK 制約、の3か所。
// ボタンの白文字が読めるよう、テーマ色は白とのコントラスト 4.5:1 以上にすること。

export const THEME_IDS = ['default', 'blue', 'green', 'orange', 'pink', 'purple'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = 'default';

// swatch は設定画面の見本に使う色（globals.css の --accent と同じ値）
export const THEMES: { id: ThemeId; label: string; swatch: string }[] = [
  { id: 'default', label: '標準（黒）', swatch: '#111827' },
  { id: 'blue', label: '青', swatch: '#1d4ed8' },
  { id: 'green', label: '緑', swatch: '#0f766e' },
  { id: 'orange', label: 'オレンジ', swatch: '#c2410c' },
  { id: 'pink', label: 'ピンク', swatch: '#be185d' },
  { id: 'purple', label: '紫', swatch: '#6d28d9' },
];

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);
}
