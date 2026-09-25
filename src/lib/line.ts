import 'server-only';
import { messagingApi, validateSignature } from '@line/bot-sdk';
import { optionalEnv } from './env';

// LINE Messaging API クライアント。
// LINE_CHANNEL_ACCESS_TOKEN が未設定の場合は送信をスキップし false を返す。
// これにより LINE 未接続でも公開フロー等が完結する。

let cachedClient: messagingApi.MessagingApiClient | null = null;

function getClient(): messagingApi.MessagingApiClient | null {
  const token = optionalEnv('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) return null;
  if (!cachedClient) {
    cachedClient = new messagingApi.MessagingApiClient({
      channelAccessToken: token,
    });
  }
  return cachedClient;
}

/**
 * 1人にプッシュ送信。成功で true、未設定/失敗で false。
 * トークンの値はログに出力しない。
 */
export async function sendPushMessage(
  lineUserId: string,
  message: string
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    await client.pushMessage({
      to: lineUserId,
      messages: [{ type: 'text', text: message }],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 複数人に一斉送信。成功で true、未設定/失敗で false。
 */
export async function sendMulticast(
  lineUserIds: string[],
  message: string
): Promise<boolean> {
  const client = getClient();
  if (!client || lineUserIds.length === 0) return false;
  try {
    await client.multicast({
      to: lineUserIds,
      messages: [{ type: 'text', text: message }],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Webhook で受け取ったイベントへの返信（replyToken を使う）。成功で true、未設定/失敗で false。
 * 返信はプッシュ送信と違い、月の送信数の上限に数えられない。
 * replyToken は1回だけ・受信から短時間しか使えないので、受け取ったらすぐ呼ぶこと。
 */
export async function sendReplyMessage(
  replyToken: string,
  message: string
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    await client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text: message }],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Webhook のリクエストが本当に LINE から来たかを確かめる。
 * 本文（受け取ったままの文字列）をチャネルシークレットで HMAC-SHA256 した値が
 * `x-line-signature` ヘッダーと一致するかを見る。
 * シークレット未設定・署名なし・不一致はすべて false（fail closed）。
 */
export function verifyLineSignature(
  rawBody: string,
  signature: string | null
): boolean {
  const secret = optionalEnv('LINE_CHANNEL_SECRET');
  if (!secret || !signature) return false;
  try {
    return validateSignature(rawBody, secret, signature);
  } catch {
    return false;
  }
}

/**
 * LINE が設定済みかどうか。
 */
export function isLineConfigured(): boolean {
  return Boolean(optionalEnv('LINE_CHANNEL_ACCESS_TOKEN'));
}
