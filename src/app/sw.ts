/// <reference lib="esnext" />
/// <reference lib="webworker" />
// PWA Service Worker（@serwist/turbopack）。serwist/[path]/route.ts の swSrc から
// 参照され、esbuild でコンパイルして /serwist/sw.js として配信される。
import { defaultCache } from '@serwist/turbopack/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // ビルド時に Serwist が注入する precache マニフェスト。
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        // オフライン時、キャッシュ外のドキュメント遷移は /~offline を表示する。
        url: '/~offline',
        matcher({ request }) {
          return request.destination === 'document';
        },
      },
    ],
  },
});

serwist.addEventListeners();
