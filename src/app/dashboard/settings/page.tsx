import { redirect } from 'next/navigation';
import { authenticateUser } from '@/lib/middleware';
import SettingsPanel from '@/components/dashboard/SettingsPanel';

// ユーザー設定。レイアウトでも認証されるが、念のためここでも確認。
export default async function SettingsPage() {
  const auth = await authenticateUser();
  if (!auth.ok) redirect('/');

  // LIFF ID はビルド時に NEXT_PUBLIC_ として埋め込まれる。未設定なら連携 UI は無効表示。
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID ?? null;

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">設定</h1>
      <SettingsPanel liffId={liffId} />
    </div>
  );
}
