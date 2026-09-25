import { NO_ROLE, SLOT_TYPE_LABEL, type SlotType } from '@/types';

// LINE のトークで送られてきた言葉に返す文面を作る（Webhook から使う）。
//
// DB にも LINE にも触らない純粋な関数だけを置く。受け取ったデータから文面を組み立てるだけなので、
// `scripts/test-line-reply.mjs`（npm test）で本番に触れずに確かめられる。
// 取得と送信は `src/app/api/line/webhook/route.ts` が行う。

export type LineCommand = 'next_shifts' | 'pending_slots' | 'help';

// リッチメニューのボタンは下の「送信テキスト」をそのまま送る設定にする。
// 手で打っても同じ返事になるよう、よく打ちそうな言い方も受け付ける。
// ⚠️ ボタンの文言を変えるときは、ここのキーワードにも同じ言葉を入れること（入れないと無反応になる）。
const KEYWORDS: Record<LineCommand, string[]> = {
  next_shifts: ['直近のシフト', '次のシフト', 'シフト', '予定'],
  pending_slots: ['未提出の枠', '未提出', '提出'],
  help: ['ヘルプ', 'help', 'メニュー', '使い方', '?'],
};

/**
 * 送られてきた文字列がどのコマンドか。どれにも当たらなければ null（＝返事をしない）。
 *
 * 当たらない言葉に返事をしないのは、公式アカウントには人がチャットで返す使い方もあるため。
 * 何を送っても「分かりません」と返ると、普通の問い合わせの邪魔になる。
 */
export function detectCommand(text: string): LineCommand | null {
  // 全角・半角や前後の空白の違いで外れないように揃える（「？」→「?」、「ＨＥＬＰ」→「help」）
  const normalized = text.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  if (!normalized) return null;
  for (const [command, words] of Object.entries(KEYWORDS) as [LineCommand, string[]][]) {
    if (words.includes(normalized)) return command;
  }
  return null;
}

/**
 * トークに載せるアプリへのリンク。LINE の中のブラウザで開く（2026-09-25 に決定）。
 *
 * 以前は `openExternalBrowser=1` を付けて端末の既定のブラウザで開いていたが、
 * iPhone のホーム画面に追加したアプリと Safari はログイン状態が別なので、多くの人にとって
 * 結局ログインが要り、LINE から別アプリに移る手間だけが残っていた。
 * LINE の中なら最初の1回ログインすれば以後はそのまま使え、閉じればトークに戻れる。
 * 外部ブラウザに戻したくなったら、ここで `url.searchParams.set('openExternalBrowser', '1')` を
 * 足し、scripts/setup-richmenu.mjs の appLink() も同じにして登録し直す。
 */
export function appLink(appUrl: string, path: string): string {
  return new URL(path, appUrl).toString();
}

// 'YYYY-MM-DD' → '10/10(金)'
function formatDate(date: string): string {
  const d = new Date(`${date}T12:00:00+09:00`);
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(d);
}

// ISO 日時 → その JST での暦日 'YYYY-MM-DD'
function jstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 'YYYY-MM-DD' 同士の日数差（to − from）
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function timeRange(start: string, end: string): string {
  return `${start.slice(0, 5)}〜${end.slice(0, 5)}`;
}

// 一覧に出す最大件数。多いとトークが縦に長くなるので、残りはアプリへ誘導する。
const MAX_ITEMS = 3;

export type ReplyRole = {
  role: string;
  date: string;
  start_time: string;
  end_time: string;
  slot_type: SlotType;
};

/**
 * 「直近のシフト」への返事。公開済みの割り当てのうち、今日以降のものを近い順に。
 * roles は fetchMyPublishedRoles() の戻り（並び順はここでも揃え直す）。
 */
export function buildNextShiftsReply(roles: ReplyRole[], today: string, appUrl: string): string {
  const upcoming = roles
    .filter((r) => r.date >= today)
    .sort((a, b) =>
      a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.start_time < b.start_time ? -1 : 1
    );
  const link = appLink(appUrl, '/dashboard/my-roles');

  if (upcoming.length === 0) {
    return (
      '【直近のシフト】\n' +
      '確定しているこれからのシフトはありません。\n' +
      '（シフトは管理者が確定・共有した時点でここに出ます）\n\n' +
      `これまでの役割はアプリで確認できます:\n${link}`
    );
  }

  const lines = upcoming.slice(0, MAX_ITEMS).map((r) => {
    const role = r.role === NO_ROLE ? '役割の指定なし' : `役割: ${r.role}`;
    const label = r.date === today ? '【今日】' : '';
    return `・${label}${formatDate(r.date)} ${timeRange(r.start_time, r.end_time)}（${SLOT_TYPE_LABEL[r.slot_type]}）\n　${role}`;
  });
  const rest = upcoming.length - MAX_ITEMS;
  return (
    '【直近のシフト】\n' +
    lines.join('\n') +
    (rest > 0 ? `\nほか ${rest} 件` : '') +
    `\n\n一覧はアプリで:\n${link}`
  );
}

export type ReplyPendingSlot = {
  date: string;
  start_time: string;
  end_time: string;
  slot_type: SlotType;
  deadline: string;
};

/**
 * 「未提出の枠」への返事。自分が対象で、まだ希望を出していない期限内の枠を締切が近い順に。
 * slots は fetchMyPendingSlots() の戻り（期限切れは除外済み）。
 */
export function buildPendingSlotsReply(
  slots: ReplyPendingSlot[],
  today: string,
  appUrl: string
): string {
  const link = appLink(appUrl, '/dashboard/shifts');

  if (slots.length === 0) {
    return '【未提出の枠】\n今、希望を出す必要のある枠はありません。';
  }

  const sorted = [...slots].sort((a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0));
  const lines = sorted.slice(0, MAX_ITEMS).map((s) => {
    const due = jstDate(s.deadline);
    const left = daysBetween(today, due);
    const when = left <= 0 ? '今日まで！' : left === 1 ? '明日まで' : `あと${left}日`;
    return `・${formatDate(s.date)} ${timeRange(s.start_time, s.end_time)}（${SLOT_TYPE_LABEL[s.slot_type]}）\n　締切 ${formatDate(due)}（${when}）`;
  });
  const rest = sorted.length - MAX_ITEMS;
  return (
    `【未提出の枠】${sorted.length} 件\n` +
    lines.join('\n') +
    (rest > 0 ? `\nほか ${rest} 件` : '') +
    `\n\nアプリから希望を出してください:\n${link}`
  );
}

export function buildHelpReply(appUrl: string): string {
  return (
    '次の言葉を送ると返事をします。\n' +
    '・「直近のシフト」… 確定したこれからのシフトと役割\n' +
    '・「未提出の枠」… まだ希望を出していない枠と締切\n\n' +
    `アプリはこちら:\n${appLink(appUrl, '/dashboard')}`
  );
}

/**
 * 1つの LINE アカウントが、在籍中の複数のアプリアカウントに連携されているときの返事。
 * どちらのシフトを答えるべきか決められないので、答えずに整理を頼む。
 */
export function buildAmbiguousReply(appUrl: string): string {
  return (
    'この LINE アカウントが、シフトアプリの複数のアカウントに連携されています。\n' +
    'どのアカウントのシフトをお知らせすればよいか分からないため、お答えできません。\n\n' +
    '使っていないほうのアカウントで「設定」→「LINE連携」を解除するか、管理者に相談してください:\n' +
    appLink(appUrl, '/dashboard/settings')
  );
}

/**
 * アプリのアカウントと LINE が結びついていない人への返事。
 * （連携していない・脱退した・別の LINE アカウントから送っている、のどれか）
 */
export function buildUnlinkedReply(appUrl: string): string {
  return (
    'この LINE アカウントはシフトアプリと連携されていないため、シフトをお知らせできません。\n\n' +
    'アプリにログインし、「設定」→「LINE連携」から連携してください:\n' +
    appLink(appUrl, '/dashboard/settings')
  );
}
