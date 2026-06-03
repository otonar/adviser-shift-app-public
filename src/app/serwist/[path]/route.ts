import { spawnSync } from 'node:child_process';
import { createSerwistRoute } from '@serwist/turbopack';

// SW（src/app/sw.ts）を esbuild でコンパイルし /serwist/sw.js として配信する。
// precache の revision はデプロイごとに変える（コミット SHA、取れなければ UUID）。
const revision =
  spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout?.trim() ||
  crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    // オフライン時のフォールバック（/~offline）を precache に追加。
    additionalPrecacheEntries: [{ url: '/~offline', revision }],
    swSrc: 'src/app/sw.ts',
    useNativeEsbuild: true,
  });
