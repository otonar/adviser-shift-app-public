-- =====================
-- 在庫数の更新日時を独立して追跡する
-- =====================
-- 目的: products.updated_at は名前・カテゴリ・説明など「何を編集しても」更新されるため、
-- 「在庫数がいつ更新されたか」を正確に表せない（古い在庫数を最新と誤認し案内ミスにつながる）。
-- 在庫数を変更したときだけ更新する専用カラムを追加し、UI で在庫の鮮度を表示する。

ALTER TABLE products
  ADD COLUMN stock_updated_at TIMESTAMPTZ DEFAULT now();

-- 既存行は updated_at を初期値として埋める（最後に編集された時刻＝在庫鮮度の最善の推定値）。
UPDATE products
  SET stock_updated_at = updated_at
  WHERE stock_updated_at IS NULL;
