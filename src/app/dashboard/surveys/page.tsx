import { redirect } from 'next/navigation';
import { authenticateUser } from '@/lib/middleware';
import { fetchVisibleSurveys, type SurveySummary } from '@/lib/staff-queries';
import SurveyList from '@/components/dashboard/SurveyList';

// スタッフ向け: 公開済みの当日アンケート結果を見る画面。
// 一覧はサーバーで取り（表示してから取りに行く形をやめた）、
// 詳細（項目ごとの値）は開いたものだけクライアントから取りに行く。
export default async function StaffSurveysPage() {
  const auth = await authenticateUser();
  if (!auth.ok) redirect('/');

  // 一覧の取得失敗は致命的でないので空扱いにする
  let surveys: SurveySummary[] = [];
  try {
    surveys = await fetchVisibleSurveys(auth.userId);
  } catch {
    surveys = [];
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">アンケート結果</h1>
        <p className="mt-1 text-sm text-gray-500">
          当日にお客さんからいただいたアンケートの結果です。
        </p>
      </div>

      <SurveyList surveys={surveys} />
    </div>
  );
}
