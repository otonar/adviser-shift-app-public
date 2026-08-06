import { redirect } from 'next/navigation';
import { authenticateAdmin } from '@/lib/middleware';
import SurveyManager from '@/components/admin/SurveyManager';

// 管理画面: 当日アンケート結果の登録・公開と、質問項目マスタの管理。
export default async function AdminSurveysPage() {
  const auth = await authenticateAdmin();
  if (!auth.ok) redirect('/admin');

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">アンケート結果</h1>
      <SurveyManager />
    </div>
  );
}
