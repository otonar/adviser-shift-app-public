// 下部ナビ用のアイコン。アイコンライブラリを増やさず、矩形・線・多角形だけで描く
// （複雑な path をコピーしないので、崩れて意味不明な図形になる事故が起きない）。
// 色は currentColor 追従なので、アクティブ／非アクティブの文字色にそのまま従う。

type IconProps = { className?: string };

const BASE = 'h-6 w-6';

function Svg({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? BASE}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// シフト: カレンダー
export function CalendarIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="3" x2="8" y2="6" />
      <line x1="16" y1="3" x2="16" y2="6" />
    </Svg>
  );
}

// 商品: 箱
export function BoxIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 8l9-4 9 4v8l-9 4-9-4V8z" />
      <path d="M3 8l9 4 9-4" />
      <line x1="12" y1="12" x2="12" y2="20" />
    </Svg>
  );
}

// 目安箱: 封筒
export function MailIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 8l9 6 9-6" />
    </Svg>
  );
}

// アンケート結果: 棒グラフ
export function ChartIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4" y="12" width="4" height="8" rx="1" />
      <rect x="10" y="7" width="4" height="13" rx="1" />
      <rect x="16" y="14" width="4" height="6" rx="1" />
    </Svg>
  );
}
