'use client';

// アンケート項目の推移表示。同じ項目の「公開済みの回」の値を古い順に並べ、
// 直前の回との差を添える。項目マスタを回で共通にしている利点をここで出す。
// 増減の良し悪しは項目によって逆になる（満足度は高いほど良いが待ち時間は低いほど良い）ため、
// 色で良し悪しを決めつけず、符号だけを示す。

export type HistoryPoint = {
  survey_id: string;
  date: string; // YYYY-MM-DD
  title: string;
  number_value: number;
};

function formatMd(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}`;
}

// 小数の見た目を揃える（4.30 → 4.3、5 → 5）
function formatNumber(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

export default function SurveyTrend({
  history,
  currentSurveyId,
  currentValue,
  unit,
}: {
  history: HistoryPoint[];
  currentSurveyId: string;
  currentValue: number | null;
  unit: string | null;
}) {
  // 今回の回は「今回」として別に出すので、過去分だけを取り出す
  const past = history.filter((h) => h.survey_id !== currentSurveyId);
  if (past.length === 0) return null;

  const prev = past[past.length - 1];
  const diff =
    currentValue !== null && Number.isFinite(currentValue)
      ? currentValue - prev.number_value
      : null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
      <span className="font-bold text-gray-400">推移</span>
      {past.map((h) => (
        <span key={h.survey_id} title={h.title}>
          {formatMd(h.date)} {formatNumber(h.number_value)}
          {unit ?? ''} →
        </span>
      ))}
      <span className="font-bold text-gray-700">
        今回 {currentValue === null ? '—' : `${formatNumber(currentValue)}${unit ?? ''}`}
      </span>
      {diff !== null && (
        <span className="rounded bg-gray-100 px-2 py-0.5">
          前回比 {diff > 0 ? '+' : diff < 0 ? '−' : '±'}
          {formatNumber(Math.abs(diff))}
          {unit ?? ''}
        </span>
      )}
    </div>
  );
}
