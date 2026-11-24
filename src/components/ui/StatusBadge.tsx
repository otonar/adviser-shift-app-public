import type { AssignmentStatus } from '@/types';

// シフト枠の状態バッジ。一覧と詳細で色が違っていたのを1つにした（2026-11-24 UI 見直し M10）。
// 「受付中」でも提出期限を過ぎていれば「割り振り待ち」として目立たせる
// （締切後に割り振りを忘れている枠に気づけるように）。
const STATUS: Record<AssignmentStatus, { label: string; cls: string }> = {
  open: { label: '受付中', cls: 'bg-blue-100 text-blue-800' },
  draft: { label: '調整中', cls: 'bg-yellow-100 text-yellow-800' },
  published: { label: '確定', cls: 'bg-green-100 text-green-800' },
};

export default function StatusBadge({
  status,
  expired = false,
  className = '',
}: {
  status: AssignmentStatus;
  expired?: boolean;
  className?: string;
}) {
  const s =
    status === 'open' && expired
      ? { label: '割り振り待ち', cls: 'bg-orange-100 font-bold text-orange-800' }
      : STATUS[status];
  return (
    <span className={`shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-xs ${s.cls} ${className}`}>
      {s.label}
    </span>
  );
}
