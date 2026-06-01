import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from './env';

// Supabase は service_role_key でサーバー専用にアクセスする（RLSは使わない）。
// このモジュールはクライアントバンドルに含めてはならない（'server-only' で保証）。
//
// service_role_key は全権限を持つため、ブラウザに絶対に渡さないこと。

let cachedClient: SupabaseClient | null = null;

/**
 * service role 権限の Supabase クライアントを返す。
 * 環境変数が未設定の場合は汎用エラーを投げる（接続情報は出力しない）。
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
}
