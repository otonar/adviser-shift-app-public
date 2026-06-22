-- =====================
-- 目安箱: 管理者からの返答
-- =====================
-- 1 投稿につき 1 件の返答（編集可）。返答の閲覧範囲は投稿自体の scope/show_name に従う
-- （その投稿が見える人には返答も見える）。返答を保存すると status は自動で 'done' になる。
ALTER TABLE suggestions
  ADD COLUMN admin_reply TEXT,
  ADD COLUMN replied_at TIMESTAMPTZ;
