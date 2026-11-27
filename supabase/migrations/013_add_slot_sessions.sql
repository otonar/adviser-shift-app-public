-- =====================
-- 1日の中の「回」ごとに役割を割り振る（2026-11-27）
-- =====================
-- 同じ日の中で役割を入れ替える場面がある（例: 1回目 加入 → 2回目 受付 → 3回目 受付 → 4回目 アテンド）。
-- 本人の判断:
--   - 回は枠ごとに「回数」だけ決める（各回に時刻は持たせない。表示は「1回目」「2回目」…）
--   - 希望提出（○×）は今までどおり枠（日）単位。○の人はその日の全部の回に出る前提
--   - 必要人数は回ごとに設定する
--   - 自動割り振りは回ごとに行い、なるべく前の回と違う役割にする（src/lib/role-assignment.ts）
--
-- 既存の枠・必要人数・割り振りは「全1回」（session = 1）としてそのまま残る＝見た目も動きも今までどおり。
--
-- 適用順: **このマイグレーションを先に流してから、コードを反映する**。
--   - 先にコードを出すと session 列が無いため枠の詳細・割り振りが読めない。
--   - 流したあと古いコードのままだと、必要人数の保存（upsert の onConflict が旧 UNIQUE 前提）が失敗する。
--     流したらすぐにコードを反映すること。
-- 何度流しても同じ結果になる。

BEGIN;

-- 枠の回数（1〜10。アプリ側の MAX_SESSIONS と合わせる）
ALTER TABLE shift_slots
  ADD COLUMN IF NOT EXISTS session_count INT NOT NULL DEFAULT 1;
ALTER TABLE shift_slots DROP CONSTRAINT IF EXISTS shift_slots_session_count_check;
ALTER TABLE shift_slots
  ADD CONSTRAINT shift_slots_session_count_check CHECK (session_count BETWEEN 1 AND 10);

-- 必要人数: 枠×回×役割 で1行
ALTER TABLE shift_role_requirements
  ADD COLUMN IF NOT EXISTS session INT NOT NULL DEFAULT 1;
ALTER TABLE shift_role_requirements DROP CONSTRAINT IF EXISTS shift_role_requirements_shift_slot_id_role_key;
ALTER TABLE shift_role_requirements DROP CONSTRAINT IF EXISTS shift_role_requirements_slot_session_role_key;
ALTER TABLE shift_role_requirements
  ADD CONSTRAINT shift_role_requirements_slot_session_role_key UNIQUE (shift_slot_id, session, role);

-- 割り振り: 1人1枠1回1役割
ALTER TABLE shift_assignments
  ADD COLUMN IF NOT EXISTS session INT NOT NULL DEFAULT 1;
ALTER TABLE shift_assignments DROP CONSTRAINT IF EXISTS shift_assignments_user_id_shift_slot_id_key;
ALTER TABLE shift_assignments DROP CONSTRAINT IF EXISTS shift_assignments_user_slot_session_key;
ALTER TABLE shift_assignments
  ADD CONSTRAINT shift_assignments_user_slot_session_key UNIQUE (user_id, shift_slot_id, session);

COMMIT;
