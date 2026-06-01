# シフト管理 PWA

大学生協 新入生事業部（技術藩）のスタッフ向けシフト管理 PWA。
スマホでのシフト提出をメインに、PC でも快適に操作できるレスポンシブ設計。
LINE 公式アカウント経由の通知機能付き。

## 主要機能

- シフト希望の提出（スタッフ）
- シフト枠の作成・対象者設定・役割割り振り・公開（管理画面）
- 確定役割の共有
- 商品・在庫情報の閲覧
- LINE 通知

## 技術スタック

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS / @ducanh2912/next-pwa
- Supabase (PostgreSQL) / 自前 JWT 認証 (bcryptjs + jsonwebtoken + httpOnly Cookie)
- zod / LINE Messaging API / Vercel

## セットアップ

詳細は [docs/SETUP.md](docs/SETUP.md)（フェーズ E で整備予定）。概要:

```bash
npm install
cp .env.local.example .env.local   # 値を手動で設定
npm run dev
```

DB は `supabase/migrations/001_initial_schema.sql` を Supabase の SQL Editor で実行する。

## ドキュメント

- [実装計画](docs/IMPLEMENTATION_PLAN.md)
- [開発ノート（進捗ログ）](docs/DEVELOPMENT_NOTES.md)

## ライセンス

未定（学内利用）。
