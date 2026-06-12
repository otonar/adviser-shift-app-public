'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/dashboard/shifts', label: 'シフト' },
  { href: '/dashboard/my-roles', label: '役割' },
  { href: '/dashboard/products', label: '商品' },
  { href: '/dashboard/settings', label: '設定' },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t bg-white pb-[env(safe-area-inset-bottom)] md:static md:border-t-0 md:border-b md:pb-0">
      <ul className="mx-auto flex max-w-2xl">
        {tabs.map((tab) => {
          const active = pathname?.startsWith(tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={`flex min-h-[3.5rem] items-center justify-center py-3 text-center text-sm md:min-h-0 ${
                  active ? 'font-bold text-gray-900' : 'text-gray-500'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
