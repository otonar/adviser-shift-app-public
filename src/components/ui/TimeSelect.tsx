'use client';

// シフトの時刻入力。1分刻みの time input だと選びづらいので 15 分刻みの select にする。
// 値の形式は time input と同じ "HH:MM"（API/DB の time 型と互換）。

const STEP_MINUTES = 15;

// 00:00 〜 23:45 を 15 分刻みで生成
const OPTIONS: string[] = Array.from(
  { length: (24 * 60) / STEP_MINUTES },
  (_, i) => {
    const total = i * STEP_MINUTES;
    const h = String(Math.floor(total / 60)).padStart(2, '0');
    const m = String(total % 60).padStart(2, '0');
    return `${h}:${m}`;
  }
);

export default function TimeSelect({
  value,
  onChange,
  required = false,
  id,
  className = 'rounded border px-3 py-2',
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  id?: string;
  className?: string;
}) {
  // 既存データが 15 分刻みでない場合（旧データ・手動投入）に選択肢から消えないよう補う
  const options =
    value && !OPTIONS.includes(value)
      ? [...OPTIONS, value].sort()
      : OPTIONS;

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className={className}
    >
      <option value="">--:--</option>
      {options.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}
