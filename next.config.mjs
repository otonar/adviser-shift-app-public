import { withSerwist } from '@serwist/turbopack';

// PWA: @serwist/turbopack（Turbopack 対応）。
// SW のソースは src/app/sw.ts、配信は src/app/serwist/[path]/route.ts（/serwist/sw.js）。
// 登録は layout.tsx の <SerwistProvider> が行う。

// Content-Security-Policy。
// Next.js のハイドレーションと Tailwind のため script/style に 'unsafe-inline' を許可
// （nonce 方式は未導入）。LIFF（static.line-scdn.net / *.line.me）と Serwist SW(self) を許可。
// connect-src を絞り、frame-ancestors/base-uri/form-action/object-src で多層防御する。
//
// 'unsafe-eval' は開発時（Turbopack の HMR 等）のみ許可し、本番では外して
// XSS 時の攻撃面を縮小する。本番ビルドの Next.js は eval を必要としない。
const isDev = process.env.NODE_ENV !== 'production';
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  ...(isDev ? ["'unsafe-eval'"] : []),
  'https://static.line-scdn.net',
].join(' ');

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.line.me https://*.line.me https://static.line-scdn.net",
  "frame-src 'self' https://*.line.me",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// セキュリティヘッダー（全ルートに適用）
const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
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
