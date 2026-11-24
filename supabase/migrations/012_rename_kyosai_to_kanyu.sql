-- =====================
-- 役割の変更（2026-11-24）: 「共済」→「加入」、「ミルパス」を追加
-- =====================
-- 当日用: 全体会, 受付, アテンド, PC, 加入, ミルパス, 学び
-- 研修用: コアメンバー, PC, 加入, ミルパス, 学び
-- （コード側の一覧は src/types/index.ts の DAY_ROLES / TRAINING_ROLES）
--
-- 本人の判断: 「共済」は「加入」に名前が変わった扱いにする。
--   - メンバーの担当可能な役割: 共済 → 加入（全員）
--   - 今日（JST）以降の枠の必要人数・割り振り: 共済 → 加入
--   - 終わった枠は当時の記録としてそのまま「共済」で残す（分析画面では別の列として出る）
--   - ミルパスは新しく増えるだけ（誰も持っていない状態から、管理画面で登録する）
-- 何度流しても同じ結果になる（2回目以降は書き換える行が無い）。

BEGIN;

-- メンバーの役割。並び順は保ったまま、置き換えて重複した値は1つにまとめる
UPDATE users
SET day_roles = ARRAY(
  SELECT r
  FROM unnest(array_replace(day_roles, '共済', '加入')) WITH ORDINALITY AS t(r, i)
  GROUP BY r
  ORDER BY min(i)
)
WHERE '共済' = ANY(day_roles);

UPDATE users
SET training_roles = ARRAY(
  SELECT r
  FROM unnest(array_replace(training_roles, '共済', '加入')) WITH ORDINALITY AS t(r, i)
  GROUP BY r
  ORDER BY min(i)
)
WHERE '共済' = ANY(training_roles);

-- 今日以降の枠の必要人数。同じ枠に「加入」の行が既にあれば「共済」の行は消す（UNIQUE(shift_slot_id, role)）
DELETE FROM shift_role_requirements q
USING shift_slots s
WHERE q.shift_slot_id = s.id
  AND s.date >= (now() AT TIME ZONE 'Asia/Tokyo')::date
  AND q.role = '共済'
  AND EXISTS (
    SELECT 1 FROM shift_role_requirements k
    WHERE k.shift_slot_id = q.shift_slot_id AND k.role = '加入'
  );

UPDATE shift_role_requirements q
SET role = '加入'
FROM shift_slots s
WHERE q.shift_slot_id = s.id
  AND s.date >= (now() AT TIME ZONE 'Asia/Tokyo')::date
  AND q.role = '共済';

-- 今日以降の枠の割り振り（1人1枠1役割なので重複は起きない）
UPDATE shift_assignments a
SET role = '加入'
FROM shift_slots s
WHERE a.shift_slot_id = s.id
  AND s.date >= (now() AT TIME ZONE 'Asia/Tokyo')::date
  AND a.role = '共済';

COMMIT;
