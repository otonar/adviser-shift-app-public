import 'server-only';
import { getUserRow } from './user-row';
import { CORE_ROLE } from '@/types';

// 閲覧範囲（'all' / 'core'）の判定。目安箱・アンケート結果で共通に使う。
// コア判定は users.training_roles に CORE_ROLE を含むこと。
// 管理者は scope に関わらず全件を見られるので、この関数は一般ユーザー向け。

export type Scope = 'all' | 'core';

/**
 * 指定ユーザーが閲覧できる scope の配列を返す。
 * コアメンバーなら ['all', 'core']、そうでなければ ['all']。
 * 取得に失敗した場合は安全側に倒して ['all'] を返す。
 */
export async function visibleScopes(userId: string): Promise<Scope[]> {
  // 認証時に引いた users の行を使い回す（同一リクエスト内では追加のクエリが出ない）。
  const row = await getUserRow(userId);
  const isCore =
    Array.isArray(row?.training_roles) && row.training_roles.includes(CORE_ROLE);
  return isCore ? ['all', 'core'] : ['all'];
}
