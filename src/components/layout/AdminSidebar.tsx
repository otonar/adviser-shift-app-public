'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

const links = [
  { href: '/admin/shifts', label: 'シフト' },
  { href: '/admin/analytics', label: '分析' },
  { href: '/admin/products', label: '商品' },
  { href: '/admin/members', label: 'メンバー' },
  { href: '/admin/notifications', label: '通知' },
  { href: '/admin/suggestions', label: '目安箱' },
  { href: '/admin/surveys', label: 'アンケート' },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
      router.push('/admin');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="w-full border-b bg-white md:w-56 md:border-b-0 md:border-r">
      <div className="flex items-center justify-between p-4">
        <span className="font-bold">管理画面</span>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loading}
          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
        >
          ログアウト
        </button>
      </div>
      {/*
        スマホでは7つが1行に収まらず詰まっていたので（2026-11-24 UI 見直し G1）、
        横にスクロールするタブにする（文字は折り返さない・選択中は下線）。PC は縦並びのまま。
      */}
      <nav className="overflow-x-auto md:overflow-visible">
        <ul className="flex md:flex-col">
          {links.map((l) => {
            const active = pathname?.startsWith(l.href);
            return (
              <li key={l.href} className="shrink-0 md:shrink">
                <Link
                  href={l.href}
                  aria-current={active ? 'page' : undefined}
                  className={`block whitespace-nowrap border-b-2 px-4 py-3 text-sm md:border-b-0 md:border-l-4 md:py-2 ${
                    active
                      ? 'border-gray-900 bg-gray-100 font-bold'
                      : 'border-transparent text-gray-600'
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
