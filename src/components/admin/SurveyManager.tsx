'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { SURVEY_ANSWER_TYPES, type SurveyAnswerType, type SurveyScope } from '@/types';

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

type Question = {
  id: string;
  label: string;
  answer_type: SurveyAnswerType;
  unit: string | null;
  sort_order: number;
  is_active: boolean;
};

export default function SurveyManager() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch('/api/surveys');
    if (res.ok) {
      const data = await res.json();
      setSurveys(data.surveys ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <CreateSurveyForm onCreated={load} />

      <section className="flex flex-col gap-3">
        <h2 className="font-bold">登録済みの結果</h2>
        {loading && <p className="text-sm text-gray-500">読み込み中…</p>}
        {!loading && surveys.length === 0 && (
          <p className="text-sm text-gray-500">まだ登録されていません。</p>
        )}
        {surveys.map((s) => (
          <Link
            key={s.id}
            href={`/admin/surveys/${s.id}`}
            className="rounded border bg-white p-4 hover:bg-gray-50"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`rounded px-2 py-0.5 font-bold ${
                  s.status === 'published'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                {s.status === 'published' ? '公開中' : '下書き'}
              </span>
              <span
                className={`rounded px-2 py-0.5 ${
                  s.scope === 'core'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-blue-100 text-blue-700'
                }`}
              >
                {s.scope === 'core' ? 'コア限定' : '全体'}
              </span>
              <span className="text-gray-500">{s.date}</span>
              {s.respondent_count !== null && (
                <span className="text-gray-500">回答 {s.respondent_count} 件</span>
              )}
            </div>
            <p className="mt-1 font-bold">{s.title}</p>
            {s.note && (
              <p className="mt-1 line-clamp-2 text-sm text-gray-600">{s.note}</p>
            )}
          </Link>
        ))}
      </section>

      <QuestionMaster />
    </div>
  );
}

// 新しい回の登録。作成時は必ず下書きで、値の入力は詳細画面で行う。
function CreateSurveyForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [respondentCount, setRespondentCount] = useState('');
  const [scope, setScope] = useState<SurveyScope>('all');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch('/api/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          title,
          note: note || null,
          respondent_count: respondentCount === '' ? null : Number(respondentCount),
          scope,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '作成に失敗しました');
        return;
      }
      setDate('');
      setTitle('');
      setNote('');
      setRespondentCount('');
      setScope('all');
      setDone(true);
      await onCreated();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <h2 className="mb-2 font-bold">結果を登録（下書き）</h2>
      <form onSubmit={submit} className="flex flex-col gap-3 rounded border bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-600">実施日</span>
            <input
              type="date"
              required
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

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">タイトル</span>
          <input
            type="text"
            required
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 4/5 新入生歓迎会 アンケート結果"
            className="rounded border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">概要・総評（任意）</span>
          <textarea
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>

        <fieldset>
          <legend className="text-sm text-gray-600">公開範囲</legend>
          <div className="mt-1 flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="survey_scope"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
              />
              全スタッフ
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="survey_scope"
                checked={scope === 'core'}
                onChange={() => setScope('core')}
              />
              コアメンバーのみ
            </label>
          </div>
        </fieldset>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !date || !title.trim()}
            className="rounded border bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? '作成中…' : '下書きを作成'}
          </button>
          {done && <span className="text-sm text-green-700">作成しました ✓</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
        <p className="text-xs text-gray-500">
          作成後、詳細画面で項目ごとの値を入力して「公開」するとスタッフに見えます。
        </p>
      </form>
    </section>
  );
}

// 質問項目マスタ。ここで登録した項目が、各回の入力欄になる。
function QuestionMaster() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [answerType, setAnswerType] = useState<SurveyAnswerType>('number');
  const [unit, setUnit] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/survey-questions');
    if (res.ok) {
      const data = await res.json();
      setQuestions(data.questions ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  async function addQuestion(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/survey-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          answer_type: answerType,
          unit: answerType === 'number' ? unit || null : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '追加に失敗しました');
        return;
      }
      setLabel('');
      setUnit('');
      await load();
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setSaving(false);
    }
  }

  async function patchQuestion(id: string, body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/survey-questions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? '更新に失敗しました');
      return false;
    }
    return true;
  }

  // 並べ替え: 画面上の順序を作り直し、位置が変わったものだけ sort_order を振り直す。
  // （sort_order が重複していても確実に並び替わる）
  async function move(index: number, dir: -1 | 1) {
    const next = [...questions];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    for (let i = 0; i < next.length; i++) {
      if (next[i].sort_order !== i) {
        const ok = await patchQuestion(next[i].id, { sort_order: i });
        if (!ok) break;
      }
    }
    await load();
  }

  async function removeQuestion(id: string) {
    if (!window.confirm('この項目を削除しますか？')) return;
    setError(null);
    try {
      const res = await fetch(`/api/survey-questions/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '削除に失敗しました');
        return;
      }
      await load();
    } catch {
      setError('通信エラーが発生しました');
    }
  }

  return (
    <section className="rounded border bg-white p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="font-bold">アンケートの項目設定</span>
        <span className="text-sm text-gray-500">{open ? '閉じる' : '開く'}</span>
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-xs text-gray-500">
            ここで登録した項目が、各回の入力欄になります。項目は回をまたいで共通なので、
            同じ項目の値を並べて推移を見られます。
          </p>

          <form onSubmit={addQuestion} className="flex flex-col gap-2 rounded bg-gray-50 p-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-600">項目名</span>
              <input
                type="text"
                required
                maxLength={200}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例: 全体の満足度（5点満点）"
                className="rounded border px-3 py-2"
              />
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-gray-600">種類</span>
                <select
                  value={answerType}
                  onChange={(e) => setAnswerType(e.target.value as SurveyAnswerType)}
                  className="rounded border px-3 py-2"
                >
                  {SURVEY_ANSWER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t === 'number' ? '数値（平均・割合・件数）' : '自由記述'}
                    </option>
                  ))}
                </select>
              </label>
              {answerType === 'number' && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600">単位（任意）</span>
                  <input
                    type="text"
                    maxLength={10}
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="点 / % / 件"
                    className="rounded border px-3 py-2"
                  />
                </label>
              )}
            </div>
            <div>
              <button
                type="submit"
                disabled={saving || !label.trim()}
                className="rounded border bg-gray-900 px-3 py-1 text-xs text-white disabled:opacity-50"
              >
                {saving ? '追加中…' : '項目を追加'}
              </button>
            </div>
          </form>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {loading && <p className="text-sm text-gray-500">読み込み中…</p>}
          {!loading && questions.length === 0 && (
            <p className="text-sm text-gray-500">項目がまだありません。</p>
          )}

          <ul className="flex flex-col gap-2">
            {questions.map((q, i) => (
              <li
                key={q.id}
                className={`flex flex-wrap items-center gap-2 rounded border p-2 text-sm ${
                  q.is_active ? '' : 'bg-gray-50 text-gray-400'
                }`}
              >
                <span className="flex-1">
                  {q.label}
                  <span className="ml-2 text-xs text-gray-500">
                    {q.answer_type === 'number'
                      ? `数値${q.unit ? `（${q.unit}）` : ''}`
                      : '自由記述'}
                  </span>
                  {!q.is_active && (
                    <span className="ml-2 rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
                      非表示
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="rounded border px-2 py-1 text-xs disabled:opacity-30"
                  aria-label="上へ"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === questions.length - 1}
                  className="rounded border px-2 py-1 text-xs disabled:opacity-30"
                  aria-label="下へ"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await patchQuestion(q.id, { is_active: !q.is_active });
                    if (ok) await load();
                  }}
                  className="rounded border px-2 py-1 text-xs"
                >
                  {q.is_active ? '非表示にする' : '表示に戻す'}
                </button>
                <button
                  type="button"
                  onClick={() => removeQuestion(q.id)}
                  className="rounded border border-red-300 px-2 py-1 text-xs text-red-700"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
