import { redirect } from 'next/navigation';
import { authenticateUser } from '@/lib/middleware';
import {
  fetchVisibleSuggestions,
  type VisibleSuggestion,
} from '@/lib/staff-queries';
import SuggestionForm from '@/components/dashboard/SuggestionForm';

function formatDateJst(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

// 目安箱。一覧はサーバーで組み立て（表示してから取りに行く形をやめた）、
// クライアント側の動きが要る投稿フォームだけを切り出している。
export default async function StaffSuggestionsPage() {
  const auth = await authenticateUser();
  if (!auth.ok) redirect('/');

  // 一覧の取得失敗は致命的でない（投稿は別フォームでできる）ので空扱いにする
  let list: VisibleSuggestion[] = [];
  try {
    list = await fetchVisibleSuggestions(auth.userId);
  } catch {
    list = [];
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">目安箱</h1>
        <p className="mt-1 text-sm text-gray-500">
          運営への質問・意見・相談を投稿できます。
        </p>
      </div>
      <SuggestionForm />

      <section className="flex flex-col gap-3">
        <h2 className="font-bold">みんなの投稿</h2>
        {list.length === 0 && (
          <p className="text-sm text-gray-500">表示できる投稿はまだありません。</p>
        )}
        {list.map((s) => (
          <article key={s.id} className="rounded border bg-white p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                {s.category}
              </span>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                {s.type}
              </span>
              {s.scope === 'core' && (
                <span className="rounded bg-purple-100 px-2 py-0.5 text-purple-700">
                  コア限定
                </span>
              )}
              {s.mine && (
                <span className="rounded bg-gray-800 px-2 py-0.5 text-white">
                  自分の投稿
                </span>
              )}
              {s.status === 'done' && (
                <span className="rounded bg-green-100 px-2 py-0.5 font-bold text-green-800">
                  対応済み
                </span>
              )}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
              {s.content}
            </p>
            <p className="mt-2 text-xs text-gray-400">
              {s.author_name ?? '（名前非表示）'} ・ {formatDateJst(s.created_at)}
            </p>
            {s.admin_reply && (
              <div className="mt-3 rounded bg-blue-50 p-3">
                <p className="text-xs font-bold text-blue-800">運営からの返答</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
                  {s.admin_reply}
                </p>
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
