-- =====================
-- スタッフ画面の着せ替え（テーマ色）
-- =====================
-- 本人が設定画面で選ぶ。別の端末でログインしても同じ見た目になるよう users に持つ。
-- 値は src/lib/themes.ts の THEME_IDS と一致させる（増やすときは両方を変える）。
--
-- 既存の行は 'default'（今までの黒）になる。コード側は列が無くても 'default' として
-- 動くので、コードを先に反映しても壊れない。ただし適用するまでは選んでも保存できない。
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'default';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_theme_check;
ALTER TABLE users
  ADD CONSTRAINT users_theme_check
  CHECK (theme IN ('default', 'blue', 'green', 'orange', 'pink', 'purple'));
