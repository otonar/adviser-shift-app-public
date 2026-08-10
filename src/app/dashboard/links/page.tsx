import { redirect } from 'next/navigation';
import { authenticateUser } from '@/lib/middleware';
import { visibleExternalLinks } from '@/lib/external-links';
import { qrPath } from '@/lib/qr';
import LinkAccordion, {
  type LinkSection,
} from '@/components/dashboard/LinkAccordion';

// 外部リンク集。中身は src/lib/external-links.ts の定数（DB は使わない）。
// QR はここ（サーバー）で作ってから渡す＝QR ライブラリはブラウザに送らない。
export default async function LinksPage() {
  const auth = await authenticateUser();
  if (!auth.ok) redirect('/');

  const sections: LinkSection[] = visibleExternalLinks().map((s) => ({
    id: s.id,
    emoji: s.emoji,
    title: s.title,
    description: s.description,
    link: s.link
      ? { url: s.link.url, label: s.link.label, qr: qrPath(s.link.url) }
      : undefined,
    poster: s.poster,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">リンク集</h1>
        <p className="mt-1 text-sm text-gray-500">
          大学・生協のサイトや、当日に使う資料をまとめています。QRコードは新入生に画面を見せて読み取ってもらえます。
        </p>
      </div>

      <LinkAccordion sections={sections} />
    </div>
  );
}
