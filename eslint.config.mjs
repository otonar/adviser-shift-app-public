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
  {
    // eslint-config-next 16 が同梱する react-hooks v7 で新たに有効化された
    // set-state-in-effect は既存のデータ取得/派生 state パターン（products・shifts）に
    // 反応する。挙動を変えるリファクタは Next16 移行PRの範囲外のため、当面 warn に降格し
    // follow-up（DEVELOPMENT_NOTES / ROADMAP）で個別対応する。
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];

export default config;
