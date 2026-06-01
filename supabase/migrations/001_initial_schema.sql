-- =====================
-- 役割の定義
-- =====================
-- 当日用役割: '全体会', '受付', 'アテンド', 'PC', '共済', '学び'
-- 研修用役割: 'コアメンバー', 'PC', '共済', '学び'
-- ※ PC・共済・学びは当日用と研修用で共通名だが、文脈（shift_slotsのslot_type）で区別

-- =====================
-- ユーザー
-- =====================
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  line_user_id TEXT,                              -- LINE通知用。NULLなら未連携
  day_roles TEXT[] DEFAULT '{}',                  -- 当日用: 担当可能な役割
  training_roles TEXT[] DEFAULT '{}',             -- 研修用: 担当可能な役割
  is_active BOOLEAN DEFAULT true,                 -- falseで脱退済み
  failed_login_attempts INT DEFAULT 0,            -- ログイン失敗回数（レート制限用）
  locked_until TIMESTAMPTZ,                       -- アカウントロック解除時刻
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- シフト枠（コアメンバーが作成）
-- =====================
CREATE TABLE shift_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slot_type TEXT NOT NULL DEFAULT 'day'
    CHECK (slot_type IN ('day', 'training')),
    -- day: 当日シフト、training: 研修シフト
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  deadline TIMESTAMPTZ NOT NULL,                  -- 提出期限（デフォルト: date - 14日の23:59:59 JST）
  assignment_status TEXT NOT NULL DEFAULT 'open'
    CHECK (assignment_status IN ('open', 'draft', 'published')),
    -- open: 希望提出受付中
    -- draft: 自動割り振り済み・管理者調整中（スタッフには非公開）
    -- published: 確定・全スタッフに公開済み
  note TEXT,                                      -- 枠に対する備考
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- シフト掲示対象スタッフ（コアが掲示前に選択）
-- =====================
CREATE TABLE shift_target_users (
  shift_slot_id UUID NOT NULL REFERENCES shift_slots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (shift_slot_id, user_id)
);

-- =====================
-- シフト枠ごとの役割別必要人数
-- =====================
CREATE TABLE shift_role_requirements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_slot_id UUID NOT NULL REFERENCES shift_slots(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
    -- day枠: '全体会', '受付', 'アテンド', 'PC', '共済', '学び'
    -- training枠: 'コアメンバー', 'PC', '共済', '学び'
  required_count INT NOT NULL DEFAULT 0,
  UNIQUE(shift_slot_id, role)
);

-- =====================
-- シフト希望提出
-- =====================
CREATE TABLE shift_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_slot_id UUID NOT NULL REFERENCES shift_slots(id) ON DELETE CASCADE,
  available BOOLEAN NOT NULL,                     -- true=○, false=×
  note TEXT,                                      -- 備考（任意）
  submitted_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, shift_slot_id)
);

-- =====================
-- 確定シフト・役割割り振り
-- =====================
CREATE TABLE shift_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_slot_id UUID NOT NULL REFERENCES shift_slots(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, shift_slot_id)                  -- 1人1枠1役割
);

-- =====================
-- 商品・在庫
-- =====================
CREATE TABLE products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  stock INT NOT NULL DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- 通知ログ
-- =====================
CREATE TABLE notification_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL,
    -- 'shift_reminder', 'role_assigned', 'shift_confirmed', 'custom'
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',          -- 'pending', 'sent', 'failed'
  sent_at TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- 管理画面ログイン試行（レート制限用）
-- =====================
-- 共有パスワード方式のためユーザーIDを持たない。
-- サーバーレス環境ではメモリが揮発するため DB に保持する（実装計画 判断ポイント3）。
CREATE TABLE admin_login_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL UNIQUE,                 -- 固定キー 'admin' など
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- インデックス
-- =====================
CREATE INDEX idx_shift_submissions_slot ON shift_submissions(shift_slot_id);
CREATE INDEX idx_shift_submissions_user ON shift_submissions(user_id);
CREATE INDEX idx_shift_assignments_slot ON shift_assignments(shift_slot_id);
CREATE INDEX idx_shift_target_users_slot ON shift_target_users(shift_slot_id);
CREATE INDEX idx_shift_target_users_user ON shift_target_users(user_id);
CREATE INDEX idx_shift_slots_date ON shift_slots(date);
CREATE INDEX idx_products_stock ON products(stock) WHERE stock = 0;
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = true;
