import { withSerwist } from '@serwist/turbopack';

// PWA: @serwist/turbopack（Turbopack 対応）。
// SW のソースは src/app/sw.ts、配信は src/app/serwist/[path]/route.ts（/serwist/sw.js）。
// 登録は layout.tsx の <SerwistProvider> が行う。

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
  // 親ディレクトリにも lockfile があり workspace root を誤検出するため明示する。
  turbopack: { root: import.meta.dirname },
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
