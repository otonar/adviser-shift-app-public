import 'server-only';
import { messagingApi } from '@line/bot-sdk';
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
 * LINE が設定済みかどうか。
 */
export function isLineConfigured(): boolean {
  return Boolean(optionalEnv('LINE_CHANNEL_ACCESS_TOKEN'));
}
