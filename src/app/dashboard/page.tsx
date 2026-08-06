import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authenticateUser } from '@/lib/middleware';
import {
  fetchMyPublishedRoles,
  fetchMyPendingSlots,
  fetchVisibleSurveys,
  nextRole,
} from '@/lib/staff-queries';
import { NO_ROLE } from '@/types';

// 提出期限を JST で「M/D(曜) HH:MM」に整形する。
function formatDeadlineJst(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function hm(t: string) {
  return t.slice(0, 5);
}

// スタッフのホーム。リンクを並べるだけの画面をやめ、
// 「今なにをすればいいか」（次のシフト・未提出・新着）が一目で分かるサマリーにしている。
export default async function Dashboard() {
  const auth = await authenticateUser();
  if (!auth.ok) redirect('/');

  const [roles, pending, surveys] = await Promise.all([
    fetchMyPublishedRoles(auth.userId),
    fetchMyPendingSlots(auth.userId),
    fetchVisibleSurveys(auth.userId, 2),
  ]);
  const next = nextRole(roles);

  return (
    <div className="flex flex-col gap-4">
      {/* 未提出のシフト希望（あるときだけ目立たせる） */}
      {pending.length > 0 ? (
        <section className="rounded border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-bold text-amber-900">
            未提出のシフト希望が {pending.length} 件あります
          </h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-amber-900">
            {pending.slice(0, 3).map((s) => (
              <li key={s.id}>
                {s.date}（{s.slot_type === 'day' ? '当日' : '研修'}）
                {hm(s.start_time)}〜{hm(s.end_time)}
                <span className="ml-1 text-xs">
                  期限 {formatDeadlineJst(s.deadline)}
                </span>
              </li>
            ))}
            {pending.length > 3 && (
              <li className="text-xs">ほか {pending.length - 3} 件</li>
            )}
          </ul>
          <Link
            href="/dashboard/shifts"
            className="mt-3 inline-block rounded bg-gray-900 px-4 py-2 text-sm text-white"
          >
            希望を出す
          </Link>
        </section>
      ) : (
        <section className="rounded border bg-white p-4">
          <p className="text-sm text-gray-600">
            未提出のシフト希望はありません ✓
          </p>
        </section>
      )}

      {/* 次のシフト */}
      <section className="rounded border bg-white p-4">
        <h2 className="font-bold">次のシフト</h2>
        {next ? (
          <div className="mt-2">
            <p className="text-lg font-bold">
              {next.date}（{next.slot_type === 'day' ? '当日' : '研修'}）
            </p>
            <p className="text-sm text-gray-600">
              {hm(next.start_time)}〜{hm(next.end_time)}
            </p>
            <p className="mt-1 text-sm">
              {next.role === NO_ROLE ? (
                <>
                  <span className="font-bold">出勤</span>
                  <span className="text-gray-500">（役割の指定なし）</span>
                </>
              ) : (
                <>
                  役割: <span className="font-bold">{next.role}</span>
                </>
              )}
            </p>
            <Link
              href="/dashboard/shifts?view=roles"
              className="mt-2 inline-block text-sm text-gray-500 underline"
            >
              確定した役割をすべて見る
            </Link>
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500">
            確定した予定はまだありません。
          </p>
        )}
      </section>

      {/* 新着のアンケート結果 */}
      <section className="rounded border bg-white p-4">
        <h2 className="font-bold">アンケート結果</h2>
        {surveys.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">
            公開されている結果はまだありません。
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {surveys.map((s) => (
              <li key={s.id} className="text-sm">
                <span className="text-gray-500">{s.date}</span>{' '}
                <Link href="/dashboard/surveys" className="underline">
                  {s.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* そのほかの入口 */}
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <Link href="/dashboard/products" className="rounded border bg-white p-3">
          商品
        </Link>
        <Link href="/dashboard/suggestions" className="rounded border bg-white p-3">
          目安箱
        </Link>
        <Link href="/dashboard/settings" className="rounded border bg-white p-3">
          設定
        </Link>
      </div>
    </div>
  );
}
