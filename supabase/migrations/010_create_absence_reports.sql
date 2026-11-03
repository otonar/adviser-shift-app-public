-- =====================
-- 欠席連絡（提出期限後の欠席）
-- =====================
-- 提出期限を過ぎると希望（○/×）は変えられない。その後に出られなくなった人が
-- 理由を添えて連絡し、コアメンバー全員に LINE で知らせる（アプリにも一覧を出す）。
--
-- 連絡できるのは「提出期限を過ぎてから、シフトの開始時刻まで」で、
-- その枠に ○ で提出した人、または確定済みの割り振りに入っている人だけ（アプリ側で検証）。
-- 割り振りは自動では外さない（コアメンバーが手で調整する）。
--
-- 取り消しは行を削除する（同じ時間内なら本人が取り消せる。取り消しも LINE で知らせる）。
-- 履歴は notification_logs に残る。
-- 1人1枠につき1件（UNIQUE）。ユーザー・枠が消えたら一緒に消す。
CREATE TABLE absence_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_slot_id UUID NOT NULL REFERENCES shift_slots(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,                              -- 欠席の理由（500文字以内はアプリ側で検証）
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, shift_slot_id)
);

CREATE INDEX idx_absence_reports_slot ON absence_reports(shift_slot_id);
