// 設定（歯車）アイコン。外部アイコンライブラリを増やさないよう、円と歯を座標計算で描く。
// 歯は中心 (12,12) から半径 6〜9 の線分を 45 度ごとに 8 本。stroke は currentColor 追従。

const TEETH = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    deg,
    x1: round(12 + 6 * cos),
    y1: round(12 + 6 * sin),
    x2: round(12 + 9 * cos),
    y2: round(12 + 9 * sin),
  };
});

export default function GearIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4.5" />
      {TEETH.map((t) => (
        <line key={t.deg} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />
      ))}
    </svg>
  );
}
