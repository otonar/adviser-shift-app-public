import { getSupabaseAdmin } from '@/lib/supabase';
import { sendReplyMessage, verifyLineSignature } from '@/lib/line';
import { optionalEnv } from '@/lib/env';
import { jsonError, jsonOk, withRoute } from '@/lib/http';
import { todayJst } from '@/lib/datetime';
import { lineWebhookSchema } from '@/lib/validators';
import { fetchMyPendingSlots, fetchMyPublishedRoles } from '@/lib/staff-queries';
import {
  buildAmbiguousReply,
  buildHelpReply,
  buildNextShiftsReply,
  buildPendingSlotsReply,
  buildUnlinkedReply,
  detectCommand,
  type LineCommand,
} from '@/lib/line-reply';

// LINE 公式アカウントの Webhook（トークに送られた言葉に返事をする）。
//
// LINE Developers コンソールの Messaging API 設定で、Webhook URL を
//   https://<アプリのドメイン>/api/line/webhook
// にして「Webhook の利用」をオンにすると、友だちがトークに送ったメッセージがここに届く。
// リッチメニューの「直近のシフト」「未提出の枠」ボタンも、その言葉を送るだけなのでここで処理される。
//
// 保護: 誰でも POST できる URL なので、本文の署名（x-line-signature）を
// LINE_CHANNEL_SECRET で検証し、LINE から来たものだけを処理する。
// ブラウザからのリクエストではないので Origin 検証（CSRF 対策）は使わない。
//
// 返事の文面は src/lib/line-reply.ts（純粋関数・npm test で検証）。

const APP_URL =
  optionalEnv('NEXT_PUBLIC_APP_URL') ?? 'https://adviser-shift-app.vercel.app';

type LinkedUser =
  | { kind: 'found'; userId: string }
  | { kind: 'unlinked' }
  | { kind: 'ambiguous' };

// LINE の userId → 在籍中のアプリのユーザー。
// 脱退した人（is_active=false）は連携が残っていても「連携なし」と同じ扱いにする。
async function findUserByLineId(lineUserId: string): Promise<LinkedUser> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('line_user_id', lineUserId)
    .eq('is_active', true)
    .limit(2);
  if (error) throw new Error('users の取得に失敗しました');
  if (!data || data.length === 0) return { kind: 'unlinked' };
  if (data.length > 1) return { kind: 'ambiguous' };
  return { kind: 'found', userId: data[0].id as string };
}

async function buildReply(command: LineCommand, lineUserId: string): Promise<string> {
  // ヘルプは本人確認なしで返す（連携前の人にも使い方は見せてよい）
  if (command === 'help') return buildHelpReply(APP_URL);

  const user = await findUserByLineId(lineUserId);
  if (user.kind === 'unlinked') return buildUnlinkedReply(APP_URL);
  if (user.kind === 'ambiguous') return buildAmbiguousReply(APP_URL);

  const today = todayJst();
  if (command === 'next_shifts') {
    return buildNextShiftsReply(await fetchMyPublishedRoles(user.userId), today, APP_URL);
  }
  return buildPendingSlotsReply(await fetchMyPendingSlots(user.userId), today, APP_URL);
}

async function handler(req: Request) {
  // 署名は「受け取ったままの本文」に対して計算されるので、JSON にする前の文字列で検証する
  const rawBody = await req.text();
  if (!verifyLineSignature(rawBody, req.headers.get('x-line-signature'))) {
    return jsonError('認証が必要です', 401, 'UNAUTHORIZED');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return jsonError('不正なリクエストです', 400, 'INVALID_JSON');
  }
  const parsed = lineWebhookSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return jsonError('入力内容を確認してください', 400, 'VALIDATION_ERROR');
  }

  // LINE コンソールの「検証」ボタンは events が空の本文を送ってくる → そのまま 200。
  // 1件の失敗で他のイベントの返事まで止めないよう、イベントごとに例外を閉じ込める。
  const results = await Promise.all(
    parsed.data.events.map(async (event) => {
      // 1対1のトークに送られた文字メッセージだけに反応する（グループ・スタンプ・画像などは無視）
      if (event.type !== 'message' || event.message?.type !== 'text') return 'ignored';
      if (event.source?.type !== 'user' || !event.source.userId || !event.replyToken) {
        return 'ignored';
      }
      const command = detectCommand(event.message.text ?? '');
      if (!command) return 'ignored'; // 知らない言葉には返事をしない（人が返す問い合わせの邪魔をしない）

      try {
        const text = await buildReply(command, event.source.userId);
        return (await sendReplyMessage(event.replyToken, text)) ? 'replied' : 'failed';
      } catch (err) {
        console.error(
          '[line-webhook] 返信の作成に失敗:',
          err instanceof Error ? err.message : 'unknown'
        );
        return 'failed';
      }
    })
  );

  // LINE は 200 以外を受け取ると失敗扱い（設定によっては再送）にするので、
  // 署名が正しいリクエストには個々の成否に関わらず 200 を返す。
  return jsonOk({
    ok: true,
    replied: results.filter((r) => r === 'replied').length,
    failed: results.filter((r) => r === 'failed').length,
  });
}

export const POST = withRoute(handler);
