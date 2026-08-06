'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarIcon,
  BoxIcon,
  MailIcon,
  ChartIcon,
} from '@/components/ui/NavIcons';

// スタッフ用ナビ。よく使う4つだけを置く。
// - 「確定した役割」はシフト画面の中の切り替えに統合（/dashboard/shifts?view=roles）
// - 「設定」はヘッダーの歯車アイコンへ移動
const tabs = [
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
          const active = pathname?.startsWith(tab.href);
          const bar = variant === 'bottom' ? 'border-t-2' : 'border-b-2';
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 px-1 py-2 text-center text-[11px] leading-tight md:min-h-0 md:text-xs ${bar} ${
                  active
                    ? 'border-gray-900 bg-gray-50 font-bold text-gray-900'
                    : 'border-transparent text-gray-500'
                }`}
              >
                <tab.Icon className="h-6 w-6" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
