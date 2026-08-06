'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { SurveyAnswerType, SurveyScope } from '@/types';
import SurveyTrend, { type HistoryPoint } from '../ui/SurveyTrend';

type Survey = {
  id: string;
  date: string;
  title: string;
  note: string | null;
  respondent_count: number | null;
  status: 'draft' | 'published';
  scope: SurveyScope;
  published_at: string | null;
};

type Item = {
  question: {
    id: string;
    label: string;
    answer_type: SurveyAnswerType;
    unit: string | null;
    is_active: boolean;
  };
  number_value: number | null;
  text_value: string | null;
  history: HistoryPoint[];
};

export default function SurveyEditor({ surveyId }: { surveyId: string }) {
  const router = useRouter();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // 編集中の値（項目ID → 入力文字列）。数値も文字列で持ち、送信時に変換する。
  const [values, setValues] = useState<Record<string, string>>({});
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [respondentCount, setRespondentCount] = useState('');
  const [scope, setScope] = useState<SurveyScope>('all');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/surveys/${surveyId}`);
    if (res.status === 404) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    if (res.ok) {
      const data = await res.json();
      const s: Survey = data.survey;
      const list: Item[] = data.items ?? [];
      setSurvey(s);
      setItems(list);
      setDate(s.date);
      setTitle(s.title);
      setNote(s.note ?? '');
      setRespondentCount(s.respondent_count === null ? '' : String(s.respondent_count));
      setScope(s.scope);
      setValues(
        Object.fromEntries(
          list.map((it) => [
            it.question.id,
            it.question.answer_type === 'number'
              ? it.number_value === null
                ? ''
                : String(it.number_value)
              : (it.text_value ?? ''),
          ])
        )
      );
    }
    setLoading(false);
  }, [surveyId]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  // 保存。status を渡すと公開／下書き戻しも同時に行う。
  // 公開だけを別リクエストにすると入力途中の値が公開に反映されないため、常に値ごと送る。
  async function save(nextStatus?: 'draft' | 'published') {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const answers = items.map((it) => {
        const raw = values[it.question.id] ?? '';
        if (it.question.answer_type === 'number') {
          const trimmed = raw.trim();
          const num = trimmed === '' ? null : Number(trimmed);
          return {
            question_id: it.question.id,
            number_value: num !== null && Number.isFinite(num) ? num : null,
            text_value: null,
          };
        }
        return {
          question_id: it.question.id,
          number_value: null,
          text_value: raw.trim() === '' ? null : raw,
        };
      });

      const res = await fetch(`/api/surveys/${surveyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          title,
          note: note || null,
          respondent_count: respondentCount === '' ? null : Number(respondentCount),
          scope,
          answers,
          ...(nextStatus ? { status: nextStatus } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '保存に失敗しました');
        return;
      }
      setSaved(true);
      await load();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('このアンケート結果を削除しますか？（元に戻せません）')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/surveys/${surveyId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '削除に失敗しました');
        return;
      }
      router.push('/admin/surveys');
      router.refresh();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-500">読み込み中…</p>;
  if (notFound || !survey) {
    return <p className="text-sm text-gray-500">アンケート結果が見つかりません。</p>;
  }

  const published = survey.status === 'published';

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded border bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded px-2 py-0.5 font-bold ${
              published ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            }`}
          >
            {published ? '公開中' : '下書き'}
          </span>
          <span className="text-gray-500">
            {published ? 'スタッフに見えています' : 'スタッフには見えていません'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-600">実施日</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-600">回答数（任意）</span>
            <input
              type="number"
              min={0}
              value={respondentCount}
              onChange={(e) => setRespondentCount(e.target.value)}
              className="rounded border px-3 py-2"
            />
          </label>
        </div>

        <label className="mt-3 flex flex-col gap-1 text-sm">
          <span className="text-gray-600">タイトル</span>
          <input
            type="text"
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>

        <label className="mt-3 flex flex-col gap-1 text-sm">
          <span className="text-gray-600">概要・総評（任意）</span>
          <textarea
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>

        <fieldset className="mt-3">
          <legend className="text-sm text-gray-600">公開範囲</legend>
          <div className="mt-1 flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="edit_scope"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
              />
              全スタッフ
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="edit_scope"
                checked={scope === 'core'}
                onChange={() => setScope('core')}
              />
              コアメンバーのみ
            </label>
          </div>
        </fieldset>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-bold">項目ごとの結果</h2>
        {items.length === 0 && (
          <p className="text-sm text-gray-500">
            項目がまだありません。一覧画面の「アンケートの項目設定」で追加してください。
          </p>
        )}
        {items.map((it) => (
          <div key={it.question.id} className="rounded border bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold">{it.question.label}</span>
              {!it.question.is_active && (
                <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                  非表示の項目
                </span>
              )}
            </div>

            {it.question.answer_type === 'number' ? (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  value={values[it.question.id] ?? ''}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [it.question.id]: e.target.value }))
                  }
                  className="w-40 rounded border px-3 py-2 text-sm"
                  placeholder="未入力"
                />
                {it.question.unit && (
                  <span className="text-sm text-gray-500">{it.question.unit}</span>
                )}
              </div>
            ) : (
              <textarea
                rows={3}
                maxLength={2000}
                value={values[it.question.id] ?? ''}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [it.question.id]: e.target.value }))
                }
                placeholder="未入力"
                className="mt-2 w-full rounded border px-3 py-2 text-sm"
              />
            )}

            {it.question.answer_type === 'number' && (
              <SurveyTrend
                history={it.history}
                currentSurveyId={survey.id}
                currentValue={
                  values[it.question.id]?.trim()
                    ? Number(values[it.question.id])
                    : null
                }
                unit={it.question.unit}
              />
            )}
          </div>
        ))}
      </section>

      <section className="flex flex-wrap items-center gap-2 rounded border bg-white p-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => save()}
          className="rounded border px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? '保存中…' : '保存する'}
        </button>
        {published ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => save('draft')}
            className="rounded border px-4 py-2 text-sm disabled:opacity-50"
          >
            下書きに戻す
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !title.trim() || !date}
            onClick={() => save('published')}
            className="rounded border bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            保存して公開する
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={remove}
          className="ml-auto rounded border border-red-300 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
        >
          削除
        </button>
        {saved && <span className="w-full text-sm text-green-700">保存しました ✓</span>}
        {error && <span className="w-full text-sm text-red-600">{error}</span>}
      </section>
    </div>
  );
}
