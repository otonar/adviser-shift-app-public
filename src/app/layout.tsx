import type { Metadata, Viewport } from 'next';
import { SerwistProvider } from '@serwist/turbopack/react';
import './globals.css';

// SW 登録は本番のみ（開発中は HMR との競合・キャッシュ事故を避けるため無効）。
const swEnabled = process.env.NODE_ENV === 'production';

export const metadata: Metadata = {
  title: 'シフト管理',
  description: '大学生協 新入生事業部 スタッフ向けシフト管理アプリ',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'シフト管理',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {swEnabled ? (
          <SerwistProvider swUrl="/serwist/sw.js">{children}</SerwistProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
