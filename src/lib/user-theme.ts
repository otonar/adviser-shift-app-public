import 'server-only';
import { cache } from 'react';
import { getSupabaseAdmin } from './supabase';
import { DEFAULT_THEME, isThemeId, type ThemeId } from './themes';

// 本人が選んだテーマ色を返す。
//
// 認証用の getUserRow（user-row.ts）には**わざと入れていない**。theme 列は migration 011 で
// 足した列で、未適用の環境で認証のクエリに混ぜると全員が未認証になってしまうため。
// こちらは失敗しても標準の色に倒すだけ（見た目だけの情報なので安全側＝標準）。
export const getUserTheme = cache(async (userId: string): Promise<ThemeId> => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .select('theme')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return DEFAULT_THEME;
    const theme = (data as { theme?: unknown }).theme;
    return isThemeId(theme) ? theme : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
});
