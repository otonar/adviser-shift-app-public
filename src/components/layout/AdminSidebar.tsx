'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

const links = [
  { href: '/admin/shifts', label: 'シフト' },
  { href: '/admin/products', label: '商品' },
  { href: '/admin/members', label: 'メンバー' },
  { href: '/admin/notifications', label: '通知' },
  { href: '/admin/suggestions', label: '目安箱' },
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
      <nav>
        <ul className="flex md:flex-col">
          {links.map((l) => {
            const active = pathname?.startsWith(l.href);
            return (
              <li key={l.href} className="flex-1">
                <Link
                  href={l.href}
                  className={`block px-4 py-2 text-sm ${
                    active ? 'bg-gray-100 font-bold' : 'text-gray-600'
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
