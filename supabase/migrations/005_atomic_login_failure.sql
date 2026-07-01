-- =====================
-- ログイン失敗カウンタのアトミック化（TOCTOU 対策）
-- =====================
-- これまで失敗カウンタは「read → 計算 → write」の非アトミック更新だったため、
-- 並列に失敗リクエストを送ると各リクエストが同じ failed_attempts を読んで
-- 同じ +1 を書き戻し、カウントが過少になってロックアウトを回避できた。
--
-- 対策: 失敗記録を関数に集約し、対象行を FOR UPDATE でロックしてから
-- 再計算 → 更新する。同一行への並列呼び出しは直列化され、確実に加算される。
-- ロックチェックと bcrypt 比較は従来どおり関数の外（ロックを保持しない）で行う。
--
-- 挙動は既存アプリと同一:
--   - 最終更新から p_window_minutes 超過（stale）→ 0 起点で数え直す
--   - locked_until が期限切れ → 0 起点で数え直す（明け直後の即再ロック回避）
--   - p_max_attempts 到達で now + p_lock_minutes までロック
--   - 呼び出しと呼び出しの間に他リクエストがロック済みなら加算せず現ロックを返す
--
-- セキュリティ: SECURITY INVOKER（既定）。アプリは service_role が PostgREST 経由で
-- 呼ぶため service_role のみに EXECUTE を付与し、anon/authenticated/PUBLIC からは剥奪する。

-- ---------- ユーザーログイン ----------
CREATE OR REPLACE FUNCTION public.record_user_login_failure(
  p_user_id uuid,
  p_max_attempts int,
  p_lock_minutes int,
  p_window_minutes int
) RETURNS TABLE(out_attempts int, out_locked_until timestamptz)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_prior       int;
  v_updated_at  timestamptz;
  v_locked      timestamptz;
  v_reset       boolean;
  v_attempts    int;
  v_new_lock    timestamptz;
BEGIN
  -- 行ロックで並列失敗を直列化（TOCTOU 回避）
  SELECT failed_login_attempts, updated_at, locked_until
    INTO v_prior, v_updated_at, v_locked
    FROM public.users
    WHERE id = p_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN; -- 対象なし（通常発生しない）: 空集合を返す
  END IF;

  -- 呼び出しの合間に他リクエストがロック済み → 加算せず現ロックを返す
  IF v_locked IS NOT NULL AND v_locked > now() THEN
    out_attempts := v_prior;
    out_locked_until := v_locked;
    RETURN NEXT;
    RETURN;
  END IF;

  -- 期限切れロック or ウィンドウ超過なら 0 起点で数え直す
  v_reset := (v_locked IS NOT NULL)
    OR (v_updated_at IS NOT NULL
        AND now() - v_updated_at > make_interval(mins => p_window_minutes));

  v_attempts := (CASE WHEN v_reset THEN 0 ELSE COALESCE(v_prior, 0) END) + 1;
  v_new_lock := CASE
    WHEN v_attempts >= p_max_attempts THEN now() + make_interval(mins => p_lock_minutes)
    ELSE NULL
  END;

  UPDATE public.users
    SET failed_login_attempts = v_attempts,
        locked_until = v_new_lock,
        updated_at = now()
    WHERE id = p_user_id;

  out_attempts := v_attempts;
  out_locked_until := v_new_lock;
  RETURN NEXT;
END;
$$;

-- ---------- 管理ログイン ----------
CREATE OR REPLACE FUNCTION public.record_admin_login_failure(
  p_identifier text,
  p_max_attempts int,
  p_lock_minutes int,
  p_window_minutes int
) RETURNS TABLE(out_attempts int, out_locked_until timestamptz)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_prior       int;
  v_updated_at  timestamptz;
  v_locked      timestamptz;
  v_reset       boolean;
  v_attempts    int;
  v_new_lock    timestamptz;
BEGIN
  -- 行が無ければ作成してからロック（並列初回でも一方が作りもう一方は待つ）
  INSERT INTO public.admin_login_attempts (identifier, failed_attempts)
    VALUES (p_identifier, 0)
    ON CONFLICT (identifier) DO NOTHING;

  SELECT failed_attempts, updated_at, locked_until
    INTO v_prior, v_updated_at, v_locked
    FROM public.admin_login_attempts
    WHERE identifier = p_identifier
    FOR UPDATE;

  IF v_locked IS NOT NULL AND v_locked > now() THEN
    out_attempts := v_prior;
    out_locked_until := v_locked;
    RETURN NEXT;
    RETURN;
  END IF;

  v_reset := (v_locked IS NOT NULL)
    OR (v_updated_at IS NOT NULL
        AND now() - v_updated_at > make_interval(mins => p_window_minutes));

  v_attempts := (CASE WHEN v_reset THEN 0 ELSE COALESCE(v_prior, 0) END) + 1;
  v_new_lock := CASE
    WHEN v_attempts >= p_max_attempts THEN now() + make_interval(mins => p_lock_minutes)
    ELSE NULL
  END;

  UPDATE public.admin_login_attempts
    SET failed_attempts = v_attempts,
        locked_until = v_new_lock,
        updated_at = now()
    WHERE identifier = p_identifier;

  out_attempts := v_attempts;
  out_locked_until := v_new_lock;
  RETURN NEXT;
END;
$$;

-- ---------- 公開 API からの実行を閉じる（service_role のみ許可） ----------
REVOKE ALL ON FUNCTION public.record_user_login_failure(uuid, int, int, int)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_admin_login_failure(text, int, int, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_user_login_failure(uuid, int, int, int)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_admin_login_failure(text, int, int, int)
  TO service_role;
