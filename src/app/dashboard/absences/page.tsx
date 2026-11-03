import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authenticateUser } from '@/lib/middleware';
import { isCoreMember } from '@/lib/scope';
import { fetchUpcomingAbsences, type AbsenceListItem } from '@/lib/absence-server';
import { formatSlotDateJa } from '@/lib/absence';
import { NO_ROLE, SLOT_TYPE_LABEL } from '@/types';

function formatDateTimeJst(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

// 欠席連絡の一覧（コアメンバーのみ）。LINE は連携済みの人にしか届かないので、
// 未連携のコアメンバーもここで見られるようにしている。今日以降のシフトのぶんだけ出す。
// 割り振りの調整は管理画面（シフト枠を開いた先）で行う。
export default async function AbsencesPage() {
  const auth = await authenticateUser();
  if (!auth.ok) redirect('/');
  // コアメンバー以外には存在を見せない（ホームにも入口を出していない）
  if (!(await isCoreMember(auth.userId))) redirect('/dashboard');

  let list: AbsenceListItem[] = [];
  let failed = false;
  try {
    list = await fetchUpcomingAbsences();
  } catch {
    failed = true;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">欠席連絡</h1>
        <p className="mt-1 text-sm text-gray-500">
          提出期限のあとに届いた欠席の連絡です（今日以降のシフト）。割り振りは自動では外れないので、必要なら管理画面で調整してください。
        </p>
      </div>

      {failed ? (
        <p className="text-sm text-red-600">読み込みに失敗しました。</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-gray-500">欠席連絡はありません。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((a) => (
            <li key={a.id} className="rounded border bg-white p-4">
              <p className="font-bold">
                {formatSlotDateJa(a.slot.date)}（{SLOT_TYPE_LABEL[a.slot.slot_type]}）
                <span className="ml-1 font-normal text-gray-600">
                  {a.slot.start_time.slice(0, 5)}〜{a.slot.end_time.slice(0, 5)}
                </span>
              </p>
              {a.slot.title && <p className="font-bold">{a.slot.title}</p>}
              <p className="mt-1">
                <span className="font-bold">{a.user_name}</span> さん
                {a.resolved && (
                  <span className="ml-1 whitespace-nowrap rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800">
                    対応済み（割り振りから外れています）
                  </span>
                )}
                {a.role !== null && (
                  <span className="ml-1 text-sm text-gray-600">
                    （{a.role === NO_ROLE ? '役割の指定なし' : `役割: ${a.role}`}）
                  </span>
                )}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">理由: {a.reason}</p>
              <p className="mt-1 text-xs text-gray-400">連絡 {formatDateTimeJst(a.created_at)}</p>
            </li>
          ))}
        </ul>
      )}

      <Link href="/dashboard" className="text-sm text-gray-500 underline">
        ホームへ戻る
      </Link>
    </div>
  );
}
