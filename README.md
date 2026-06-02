# シフト管理 PWA

大学生協 新入生事業部（技術藩）のスタッフ向けシフト管理 PWA。
スマホでのシフト提出をメインに、PC でも快適に操作できるレスポンシブ設計。
LINE 公式アカウント経由の通知機能付き。

## 主要機能

- シフト希望の提出（スタッフ・対象者フィルタ・期限管理）
- シフト枠の作成・対象者設定・役割の自動割り振り→手動調整→公開（管理画面）
- 確定役割の共有（公開済みのみ）
- 商品・在庫情報の閲覧 / 管理（CRUD）
- ユーザー設定（名前・役割・LINE 連携・脱退）・メンバー管理（強制脱退）
- LINE 通知（一斉 / 個別送信・送信ログ）

## 技術スタック

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS / @ducanh2912/next-pwa
- Supabase (PostgreSQL) / 自前 JWT 認証 (bcryptjs + jsonwebtoken + httpOnly Cookie)
- zod / LINE Messaging API / Vercel

## クイックスタート

```bash
npm install
cp .env.local.example .env.local   # 値を手動で設定（Windows は copy）
npm run dev
```

DB は `supabase/migrations/001_initial_schema.sql` を Supabase の SQL Editor で実行する。
詳細な手順・環境変数の取得先は [docs/SETUP.md](docs/SETUP.md) を参照。

## ドキュメント

- [SETUP — 環境構築・実行方法](docs/SETUP.md)
- [USAGE — 使用方法（スタッフ / 管理者）](docs/USAGE.md)
- [TEST_CHECKLIST — 実地テスト手順](docs/TEST_CHECKLIST.md)
- [CAUTION — 使用上の注意事項](docs/CAUTION.md)
- [ARCHITECTURE — ファイル構成・アーキテクチャ](docs/ARCHITECTURE.md)
- [DESIGN_DECISIONS — 課題分析・技術選定](docs/DESIGN_DECISIONS.md)
- [DEVELOPMENT_NOTES — 開発ノート（進捗ログ）](docs/DEVELOPMENT_NOTES.md)
- [ROADMAP — 今後の展望](docs/ROADMAP.md)
- [IMPLEMENTATION_PLAN — 実装計画](docs/IMPLEMENTATION_PLAN.md)

## ライセンス

未定（学内利用）。
