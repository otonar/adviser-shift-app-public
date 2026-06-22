-- =====================
-- 目安箱（スタッフからの意見・要望投稿）
-- =====================
-- スタッフが運営へ意見・質問・相談を投稿する。
-- 公開設定は 2 軸で独立して指定する:
--   show_name : 投稿者名を表示するか（true=表示 / false=非表示）。
--               false でも user_id は保存する（不適切投稿時に運用で辿れる余地）。
--               非表示のときは画面に名前を出さない（管理画面でも出さない）。
--   scope     : 閲覧範囲。'all'=全スタッフ / 'core'=コアメンバーのみ。
--               管理者は scope に関わらず全件を閲覧できる。
--               コア判定は users.training_roles に 'コアメンバー' を含むこと。
-- status: 'open'(未対応) / 'done'(対応済み)
-- ON DELETE SET NULL: ユーザーが物理削除されても投稿自体は残す。
CREATE TABLE suggestions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  type TEXT NOT NULL,
  show_name BOOLEAN NOT NULL DEFAULT false,
  scope TEXT NOT NULL DEFAULT 'all',
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_suggestions_scope ON suggestions(scope);
CREATE INDEX idx_suggestions_status ON suggestions(status);
CREATE INDEX idx_suggestions_created ON suggestions(created_at DESC);
