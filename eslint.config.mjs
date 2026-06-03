// ESLint Flat Config（ESLint 9 / Next 16）。
// Next 16 で `next lint` は廃止され、ESLint CLI を直接使う（`npm run lint`）。
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/**', // next-pwa が生成する sw.js / workbox-*.js を含む
      'next-env.d.ts',
    ],
  },
  ...nextCoreWebVitals,
  // フォーマット系ルールは Prettier に委ねる（最後に置いて競合を無効化）。
  prettier,
];

export default config;
