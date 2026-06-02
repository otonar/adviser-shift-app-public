const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  // 開発中は Service Worker を無効化（HMR との競合・キャッシュ事故を避ける）
  disable: process.env.NODE_ENV === 'development',
  register: true,
  // オフライン時、キャッシュ外のページは src/app/~offline を表示する
  fallbacks: {
    document: '/~offline',
  },
  workboxOptions: {
    skipWaiting: true,
  },
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

module.exports = withPWA(nextConfig);
