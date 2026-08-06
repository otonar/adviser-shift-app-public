import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authenticateAdmin } from '@/lib/middleware';
import SurveyEditor from '@/components/admin/SurveyEditor';

// 管理画面: アンケート結果 1 回分の編集（項目ごとの値入力・公開/下書き切り替え）。
export default async function AdminSurveyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await authenticateAdmin();
  if (!auth.ok) redirect('/admin');

  const { id } = await params;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/surveys" className="text-sm text-gray-500">
        ← アンケート結果一覧へ戻る
      </Link>
      <SurveyEditor surveyId={id} />
    </div>
  );
}
