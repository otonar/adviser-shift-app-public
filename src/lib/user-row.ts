import 'server-only';
import { cache } from 'react';
import { getSupabaseAdmin } from './supabase';

// 認証（middleware.ts）と閲覧範囲の判定（scope.ts）は、どちらも users の同じ1行を見る。
// 別々に引くと 1リクエストで同じ行を何度も取りに行くことになるため、ここに集約する。
//
// React の cache() で包む狙いは「同一リクエスト内での重複クエリを消す」こと。
// - レイアウトとページが別々に authenticateUser() を呼んでも users は1回しか引かない
// - API ルートで認証したあとに visibleScopes() を呼んでも追加のクエリが出ない
//
// ⚠️ これは**リクエストをまたがない**キャッシュ。次のリクエストでは必ず引き直すので、
// 脱退（is_active=false）やパスワード変更（token_version の繰り上げ）は従来どおり
// 即座に効く＝認証の厳密さは一切変わらない。リクエストをまたぐキャッシュ
// （unstable_cache や revalidate）をここに入れてはいけない。

export type UserRow = {
  is_active: boolean;
  token_version: number | null;
  training_roles: string[] | null;
};

/**
 * 認証・閲覧範囲の判定に使う users の1行を返す。
 * 見つからない場合・取得に失敗した場合は null（呼び出し側が安全側に倒す）。
 */
export const getUserRow = cache(async (userId: string): Promise<UserRow | null> => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .select('is_active, token_version, training_roles')
      .eq('id', userId)
      .single();

    if (error || !data) return null;
    return data as UserRow;
  } catch {
    // env 未設定・DB 接続不可。呼び出し側で未認証／範囲外として扱う（fail closed）
    return null;
  }
});
