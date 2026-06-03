import { randomUUID } from 'node:crypto';
import withSerwistInit from '@serwist/next';

// PWA: next-pwa から @serwist/next（webpack）へ移行。
// SW のソースは src/app/sw.ts、出力は public/sw.js。
// オフラインフォールバック（/~offline）はビルドごとに revision を振って precache する。
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  additionalPrecacheEntries: [{ url: '/~offline', revision: randomUUID() }],
  // 開発中は SW を無効化（HMR との競合・キャッシュ事故を避ける）。
  disable: process.env.NODE_ENV === 'development',
});

// セキュリティヘッダー（全ルートに適用）
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default withSerwist(nextConfig);
