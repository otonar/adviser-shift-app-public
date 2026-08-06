'use client';

import { useEffect, useState } from 'react';
import type { SurveyAnswerType, SurveyScope } from '@/types';
import SurveyTrend, { type HistoryPoint } from '@/components/ui/SurveyTrend';

type Survey = {
  id: string;
  date: string;
  title: string;
  note: string | null;
  respondent_count: number | null;
  scope: SurveyScope;
  published_at: string | null;
};

type Item = {
  question: {
    id: string;
    label: string;
    answer_type: SurveyAnswerType;
    unit: string | null;
  };
  number_value: number | null;
  text_value: string | null;
  history: HistoryPoint[];
};

// スタッフ向け: 公開済みの当日アンケート結果を見る画面。
// 一覧はまとめて取り、詳細（項目ごとの値）は開いたものだけ取りに行く。
export default function StaffSurveysPage() {
  const [list, setList] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/surveys?scope=mine');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setList(data.surveys ?? []);
      } catch {
        // 一覧の取得失敗は致命的でないため握りつぶす
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">アンケート結果</h1>
        <p className="mt-1 text-sm text-gray-500">
          当日にお客さんからいただいたアンケートの結果です。
        </p>
      </div>

      {loading && <p className="text-sm text-gray-500">読み込み中…</p>}
      {!loading && list.length === 0 && (
        <p className="text-sm text-gray-500">公開されている結果はまだありません。</p>
      )}

      {list.map((s) => (
        <article key={s.id} className="rounded border bg-white p-4">
          <button
            type="button"
            onClick={() => setOpenId((cur) => (cur === s.id ? null : s.id))}
            className="w-full text-left"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-gray-500">{s.date}</span>
              {s.respondent_count !== null && (
                <span className="text-gray-500">回答 {s.respondent_count} 件</span>
              )}
              {s.scope === 'core' && (
                <span className="rounded bg-purple-100 px-2 py-0.5 text-purple-700">
                  コア限定
                </span>
              )}
              <span className="ml-auto text-gray-400">
                {openId === s.id ? '閉じる' : '結果を見る'}
              </span>
            </div>
            <p className="mt-1 font-bold">{s.title}</p>
          </button>

          {s.note && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{s.note}</p>
          )}

          {openId === s.id && <SurveyDetail surveyId={s.id} />}
        </article>
      ))}
    </div>
  );
}

function SurveyDetail({ surveyId }: { surveyId: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/surveys/${surveyId}?scope=mine`);
        if (!res.ok) {
          if (!cancelled) setError(true);
          return;
        }
        const data = await res.json();
        if (!cancelled) setItems(data.items ?? []);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [surveyId]);

  if (error) return <p className="mt-3 text-sm text-red-600">読み込みに失敗しました。</p>;
  if (items === null) return <p className="mt-3 text-sm text-gray-500">読み込み中…</p>;
  if (items.length === 0) {
    return <p className="mt-3 text-sm text-gray-500">項目ごとの結果はまだありません。</p>;
  }

  return (
    <dl className="mt-3 flex flex-col gap-3 border-t pt-3">
      {items.map((it) => (
        <div key={it.question.id}>
          <dt className="text-sm font-bold text-gray-700">{it.question.label}</dt>
          <dd className="mt-1">
            {it.question.answer_type === 'number' ? (
              <>
                <span className="text-lg font-bold">
                  {it.number_value === null ? '—' : it.number_value}
                </span>
                {it.question.unit && (
                  <span className="ml-1 text-sm text-gray-500">{it.question.unit}</span>
                )}
                <SurveyTrend
                  history={it.history}
                  currentSurveyId={surveyId}
                  currentValue={it.number_value}
                  unit={it.question.unit}
                />
              </>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-gray-800">
                {it.text_value}
              </p>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
