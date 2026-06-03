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

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
- Tailwind CSS / PWA: @serwist/turbopack
- Supabase (PostgreSQL) / 自前 JWT 認証 (bcryptjs + jsonwebtoken + httpOnly Cookie)
- zod / LINE Messaging API / Vercel

## クイックスタート

```bash
npm install
cp .env.local.example .env.local   # 値を手動で設定（Windows は copy）
npm run dev
```

DB は `supabase/migrations/001_initial_schema.sql` を Supabase の SQL Editor で実行する。
環境変数のキーは `.env.local.example` を参照（値は各自で設定）。

## ドキュメント

設計・運用の詳細ドキュメント（SETUP / USAGE / ARCHITECTURE / 開発ノート 等）は
リポジトリ外でローカル管理しています（公開対象外）。

## ライセンス

未定（学内利用）。
