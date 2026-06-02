import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import type { ZodSchema } from 'zod';
import type { ApiError } from '@/types';

// エラーレスポンスは統一フォーマット { error, code? }。
// 内部エラーの詳細（スタックトレース・DB構造）はクライアントに返さない。

export function jsonError(message: string, status: number, code?: string) {
  const body: ApiError = code ? { error: message, code } : { error: message };
  return NextResponse.json(body, { status });
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

/**
 * リクエストボディを JSON として読み、zod でバリデーションする。
 * 失敗時は汎用メッセージのエラーレスポンスを返す（詳細は漏らさない）。
 */
export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: jsonError('不正なリクエストです', 400, 'INVALID_JSON') };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      response: jsonError('入力内容を確認してください', 400, 'VALIDATION_ERROR'),
    };
  }
  return { ok: true, data: result.data };
}

/**
 * CSRF 対策: 状態変更リクエストで Origin ヘッダーがリクエスト先ホストと
 * 一致することを検証する（SameSite Cookie と併用）。
 * Origin が無い／不一致なら false。
 */
export function verifyOrigin(): boolean {
  const h = headers();
  const origin = h.get('origin');
  const host = h.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function forbiddenOrigin() {
  return jsonError('リクエストが拒否されました', 403, 'FORBIDDEN_ORIGIN');
}

type RouteHandler<A extends unknown[]> = (
  ...args: A
) => Response | Promise<Response>;

/**
 * Route Handler を包み、未捕捉の例外を統一フォーマットの 500 に変換する。
 * env 未設定（getSupabaseAdmin / requireEnv が throw）や想定外の例外でも、
 * 内部情報（スタックトレース・DB 構造・環境変数の値）をクライアントに返さない。
 * サーバーログにはメッセージのみ残す（値は出力しない）。
 */
export function withRoute<A extends unknown[]>(
  handler: RouteHandler<A>
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error(
        '[route] 未捕捉の例外:',
        err instanceof Error ? err.message : 'unknown'
      );
      return jsonError('サーバーエラーが発生しました', 500, 'INTERNAL_ERROR');
    }
  };
}
