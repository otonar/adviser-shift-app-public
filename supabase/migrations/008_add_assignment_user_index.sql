-- =====================
-- 「自分の割り当て」を引くための index
-- =====================
-- shift_assignments には shift_slot_id の index はあったが user_id には無かった。
-- スタッフ画面（ホームのサマリー・シフト画面の「確定した役割」）は
-- fetchMyPublishedRoles() で user_id 一本で絞るため、この index が効く。
--
-- 現状のデータ量（スタッフ50名規模）では全件走査でも十分速く、体感差はほぼ無い。
-- 学期をまたいで割り当てが積み上がったときに効いてくる予防的な追加。
--
-- 追加のみで既存の列・データには触れないため、適用順序は問わない
-- （コードを先に反映しても壊れない）。
CREATE INDEX IF NOT EXISTS idx_shift_assignments_user
  ON shift_assignments(user_id);
