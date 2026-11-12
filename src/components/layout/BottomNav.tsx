'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HomeIcon,
  CalendarIcon,
  BoxIcon,
  MailIcon,
  ChartIcon,
} from '@/components/ui/NavIcons';

// スタッフ用ナビ。ホーム＋よく使う4つの計5つ（2026-11-12 にホームを追加）。
// - 「確定した役割」はシフト画面の中の切り替えに統合（/dashboard/shifts?view=roles）
// - 「設定」はヘッダーの歯車アイコンへ移動
// - これ以上増える導線（リンク集など）はホームの入口ボタンに置く
// exact: true のタブは完全一致のときだけアクティブにする
// （/dashboard は全ページの接頭辞なので、前方一致だと常にアクティブになってしまう）。
const tabs = [
  { href: '/dashboard', label: 'ホーム', Icon: HomeIcon, exact: true },
  { href: '/dashboard/shifts', label: 'シフト', Icon: CalendarIcon },
  { href: '/dashboard/products', label: '商品', Icon: BoxIcon },
  { href: '/dashboard/suggestions', label: '目安箱', Icon: MailIcon },
  { href: '/dashboard/surveys', label: 'アンケート', Icon: ChartIcon },
];

// variant はナビの位置。アクティブ表示のバーを、画面下なら上辺・画面上なら下辺に出す
// （バーが画面の縁ではなくコンテンツ側を向くようにするため）。
export default function BottomNav({
  variant = 'bottom',
}: {
  variant?: 'bottom' | 'top';
}) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t bg-white pb-[env(safe-area-inset-bottom)] md:static md:border-t-0 md:border-b md:pb-0">
      <ul className="mx-auto flex max-w-2xl">
        {tabs.map((tab) => {
          const active =
            'exact' in tab && tab.exact
              ? pathname === tab.href
              : pathname?.startsWith(tab.href);
          const bar = variant === 'bottom' ? 'border-t-2' : 'border-b-2';
          return (
            <li key={tab.href} className="flex-1">
              {/*
                スマホでは指で押す前提なので、セル全体（幅いっぱい・高さ 80px）を
                タップ領域にする。iOS/Android の推奨は 44〜48px 四方なので余裕を取る。
                下余白（pb-3）を上（pt-2）より厚くしているのは、ラベルが下辺に
                詰まって見えるのを避けるため（文字の下は行間しか無く、余白が
                上下同じだと下がきつく見える）。
                PC ではポインタで押すため、md 以上では詰めて高さを抑える。
                5タブだと幅 320px の端末で1つ 64px になる。いちばん長い
                「アンケート」（5文字）が折り返さないよう、文字は 12px・左右余白は
                最小（px-0.5）にしている（12px × 5 = 60px）。
              */}
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[5rem] touch-manipulation flex-col items-center justify-center gap-1.5 px-0.5 pt-2 pb-3 text-center text-xs leading-tight whitespace-nowrap transition-colors active:bg-gray-100 md:min-h-0 md:gap-0.5 md:py-2.5 md:text-xs ${bar} ${
                  active
                    ? 'border-gray-900 bg-gray-50 font-bold text-gray-900'
                    : 'border-transparent text-gray-500'
                }`}
              >
                <tab.Icon className="h-7 w-7 md:h-6 md:w-6" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
