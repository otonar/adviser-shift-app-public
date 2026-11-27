import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authenticateUser } from '@/lib/middleware';
import {
  fetchMyPublishedRoles,
  fetchMyPendingSlots,
  fetchVisibleSurveys,
  upcomingRoles,
} from '@/lib/staff-queries';
import { SLOT_TYPE_LABEL } from '@/types';
import RoleText from '@/components/ui/RoleText';
import { formatDeadlineJst, formatDateJa, formatTimeRange } from '@/lib/datetime';
import { isCoreMember } from '@/lib/scope';
import { fetchUpcomingAbsences } from '@/lib/absence-server';

// スタッフのホーム。リンクを並べるだけの画面をやめ、
// 「今なにをすればいいか」（次のシフト・未提出・新着）が一目で分かるサマリーにしている。
export default async function Dashboard() {
  const auth = await authenticateUser();
  if (!auth.ok) redirect('/');

  const [roles, pending, surveys] = await Promise.all([
    fetchMyPublishedRoles(auth.userId),
    fetchMyPendingSlots(auth.userId),
    // ホームは他の情報も出すので、アンケートの取得失敗だけで画面を壊さない
    fetchVisibleSurveys(auth.userId, 2).catch(() => []),
  ]);
  // 次のシフトは直近 3 件まで（1件だけだと2件目以降を見にシフト画面へ行く必要があった）
  const nextRoles = upcomingRoles(roles, 3);

  // 欠席連絡の一覧はコアメンバーだけに見せる。取得に失敗してもホームは壊さない（件数を出さないだけ）
  const isCore = await isCoreMember(auth.userId);
  const absenceCount = isCore
    ? await fetchUpcomingAbsences()
        // 割り振りから外し済み（対応済み）のものは数えない
        .then((list) => list.filter((a) => !a.resolved).length)
        .catch(() => null)
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/* 未提出のシフト希望。あるときだけ一番上に目立たせる（無い日は予定を一番上に） */}
      {pending.length > 0 && (
        <section className="rounded border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-bold text-amber-900">
            未提出のシフト希望が {pending.length} 件あります
          </h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-amber-900">
            {pending.slice(0, 3).map((s) => (
              <li key={s.id}>
                {formatDateJa(s.date)} {formatTimeRange(s.start_time, s.end_time)}・
                {SLOT_TYPE_LABEL[s.slot_type]}
                {s.title && <span className="ml-1 font-bold">{s.title}</span>}
                <span className="ml-1 text-xs">期限 {formatDeadlineJst(s.deadline)}</span>
              </li>
            ))}
            {pending.length > 3 && <li className="text-xs">ほか {pending.length - 3} 件</li>}
          </ul>
          <Link
            href="/dashboard/shifts"
            className="press mt-3 inline-block rounded bg-accent px-4 py-2 text-sm text-white"
          >
            希望を出す
          </Link>
        </section>
      )}

      {/* 欠席連絡（コアメンバーのみ）。あるときだけ目立たせる */}
      {isCore && (
        <Link
          href="/dashboard/absences"
          className={`press rounded border p-4 ${
            absenceCount ? 'border-red-300 bg-red-50 text-red-900' : 'bg-white'
          }`}
        >
          <span className="font-bold">欠席連絡</span>
          <span className="ml-2 text-sm">
            {absenceCount === null
              ? '一覧を見る'
              : absenceCount > 0
                ? `未対応が ${absenceCount} 件あります`
                : '未対応はありません'}
          </span>
        </Link>
      )}

      {/* 次のシフト（直近3件） */}
      <section className="rounded border bg-white p-4">
        <h2 className="font-bold">次のシフト</h2>
        {nextRoles.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">確定した予定はまだありません。</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y">
            {nextRoles.map((r, i) => (
              <li key={r.slot_id} className="py-2 first:pt-0 last:pb-0">
                <p className={i === 0 ? 'text-lg font-bold' : 'font-bold'}>
                  {formatDateJa(r.date)}
                  <span className="ml-1 text-sm font-normal text-gray-600">
                    {formatTimeRange(r.start_time, r.end_time)}・{SLOT_TYPE_LABEL[r.slot_type]}
                  </span>
                </p>
                {r.title && <p className="font-bold">{r.title}</p>}
                <p className="text-sm">
                  <RoleText roles={r.roles} />
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
          <Link href="/dashboard/shifts?view=roles" className="text-gray-600 underline">
            確定した役割をすべて見る
          </Link>
          {pending.length === 0 && (
            <span className="text-xs text-gray-500">未提出のシフト希望はありません ✓</span>
          )}
        </div>
      </section>

      {/* 新着のアンケート結果。押すとその結果を開いた状態で一覧へ */}
      <section className="rounded border bg-white p-4">
        <h2 className="font-bold">アンケート結果</h2>
        {surveys.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">公開されている結果はまだありません。</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {surveys.map((s) => (
              <li key={s.id} className="text-sm">
                <span className="text-gray-500">{formatDateJa(s.date)}</span>{' '}
                <Link href={`/dashboard/surveys?open=${s.id}`} className="underline">
                  {s.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/*
        下部タブ・ヘッダーに無い入口だけを置く（2026-11-24。商品・目安箱は下部タブ、
        設定はヘッダーの歯車と重複していたので外した）。増える導線はここに足す。
      */}
      <Link
        href="/dashboard/links"
        className="press flex items-center justify-between rounded border bg-white p-4"
      >
        <span className="font-bold">リンク集</span>
        <span className="text-sm text-gray-500">大学・生協のサイト、当日の資料 ›</span>
      </Link>
    </div>
  );
}
