import { NO_ROLE } from '@/types';
import { sessionLabel, uniformRole } from '@/lib/session-roles';

// 確定した役割の表示（ホーム・シフト画面・カレンダーで共通）。roles は回の順。
//   全回「役割なし」 → 出勤（役割の指定なし）
//   全回同じ役割     → 役割: 受付
//   回で違う         → 役割: 1回目 加入・2回目 受付・…
// 外側の <p> などは呼び出し側が持つ。
export default function RoleText({
  roles,
  noteClassName = 'text-gray-500',
}: {
  roles: readonly string[];
  // 「（役割の指定なし）」の文字の見た目（置き場所で大きさが違うため）
  noteClassName?: string;
}) {
  const u = uniformRole(roles);
  if (u === NO_ROLE) {
    return (
      <>
        <span className="font-bold">出勤</span>
        <span className={noteClassName}>（役割の指定なし）</span>
      </>
    );
  }
  if (u !== null) {
    return (
      <>
        役割: <span className="font-bold">{u}</span>
      </>
    );
  }
  return (
    <>
      役割:{' '}
      {roles.map((r, i) => (
        <span key={i} className="whitespace-nowrap">
          {i > 0 && '・'}
          {sessionLabel(i + 1)}{' '}
          {r === NO_ROLE ? (
            <span className={noteClassName}>指定なし</span>
          ) : (
            <span className="font-bold">{r}</span>
          )}
        </span>
      ))}
    </>
  );
}
