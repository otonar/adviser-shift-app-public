-- =====================
-- 当日アンケート結果の共有
-- =====================
-- 「当日」終了後に集めたお客さんのアンケート結果を、管理ユーザーが登録して
-- 一般ユーザー（スタッフ）へ共有する。
--
-- 設計の考え方:
--   アンケートの質問項目そのものは運用で変わりうるので、項目を「マスタ」として
--   切り出し（survey_questions）、1回分の結果（surveys）に対して項目ごとの集計値
--   （survey_answers）をぶら下げる。項目マスタが回をまたいで共通なので、
--   同じ項目の値を並べれば回次間の推移が出せる。
--   逆に、項目が未確定のうちは項目マスタが空のまま = 結果の登録だけ先に作れる。

-- ---------------------
-- 質問項目マスタ（管理画面から追加・並べ替え・アーカイブする）
-- ---------------------
-- answer_type:
--   'number' = 集計値（平均点・割合・件数など）。unit に「点」「%」「件」等を入れる。
--              選択肢別の割合は「選択肢ごとに項目を分けて % で入れる」ことで表現する。
--   'text'   = 自由記述（コメントの抜粋・総評など）。
-- is_active=false はアーカイブ。新しい回の入力欄には出さないが、
-- 過去の回に入っている値はそのまま残り、推移にも出る。
CREATE TABLE survey_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  answer_type TEXT NOT NULL DEFAULT 'number'
    CHECK (answer_type IN ('number', 'text')),
  unit TEXT,                                       -- 'number' のときの単位（任意）
  sort_order INT NOT NULL DEFAULT 0,               -- 表示順（小さいほど上）
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---------------------
-- アンケート結果（1件 = 1回の「当日」）
-- ---------------------
-- status: 'draft'(下書き・管理者のみ) / 'published'(公開・スタッフが閲覧可)
--         シフトの assignment_status と同じ考え方で、公開して初めて見える。
-- scope : 'all'(全スタッフ) / 'core'(コアメンバーのみ)。目安箱と同じ判定
--         （users.training_roles に 'コアメンバー' を含むか）を使う。
--         管理者は scope に関わらず全件を閲覧できる。
CREATE TABLE surveys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,                              -- 実施日（当日の日付・JST）
  title TEXT NOT NULL,
  note TEXT,                                       -- 概要・総評（任意）
  respondent_count INT,                            -- 回答数（任意）
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  scope TEXT NOT NULL DEFAULT 'all'
    CHECK (scope IN ('all', 'core')),
  published_at TIMESTAMPTZ,                        -- 公開した時刻（下書きに戻すと NULL）
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---------------------
-- 回 × 項目 の値
-- ---------------------
-- answer_type に応じて number_value / text_value のどちらかを使う。
-- 両方 NULL の行は「未入力」を意味するのでアプリ側では保存せず削除する。
-- 項目マスタの削除は過去の回の値を壊すため RESTRICT（API 側でも使用中は拒否し、
-- 代わりに is_active=false のアーカイブを案内する）。
CREATE TABLE survey_answers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES survey_questions(id) ON DELETE RESTRICT,
  number_value NUMERIC,
  text_value TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(survey_id, question_id)
);

-- =====================
-- インデックス
-- =====================
CREATE INDEX idx_surveys_date ON surveys(date DESC);
CREATE INDEX idx_surveys_status ON surveys(status);
CREATE INDEX idx_survey_answers_survey ON survey_answers(survey_id);
CREATE INDEX idx_survey_answers_question ON survey_answers(question_id);
CREATE INDEX idx_survey_questions_sort ON survey_questions(sort_order);
