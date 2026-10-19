-- ============================================================
-- 館別設定總覽（團隊 onboarding）第一階段：負責 AM／職代 AM 與 hotel_admin 自動同步
--   1. accommodation_responsible_am：館別負責 AM（含歷史）。部分唯一索引保證「一館同時只有一位負責 AM」
--      只能指定「在職、具 am 角色、且不是 am_manager」的成員（AM 總管只領 AM 總管獎金）
--   2. accommodation_am_settings：館別「不需要負責 AM」標記（小鈴鐺與總覽不再提醒）
--   3. am_hotel_admin_grants：記錄「系統自動開」的 hotel_admin；收回時只動這些，HQ 手動開的一律不動
--   4. team_member_profiles.am_managed_accommodation_ids 改為系統同步欄位：
--      = 該成員目前負責、且館別開賣中（is_active）的館別。獎金快照（create-team-bonus-snapshots）不需修改，
--      AM 績效獎金／AM 場域獎金自然只算負責 AM。直接改這個欄位一律拒絕（只能經 RPC／trigger 同步）
--   5. 職代 AM：全體在職 am／am_manager 自動取得「開賣中或上架中（first_activated_at IS NULL）」館別的 hotel_admin
--      - 新增館別、館別重新開賣 → 幫全體 AM 開
--      - 成員取得 am／am_manager 角色或恢復在職 → 幫他開
--      - 成員失去 am／am_manager 角色或停用 → 只收回系統開的 hotel_admin，並結束他的負責 AM
--      - 館別停用（開賣 → 停用）→ 自動結束負責 AM（保留歷史）
--   6. am_manages_accommodation 改為：在職 am／am_manager 皆可協作所有館（不再只限勾選館別）
--   7. RPC：team_set_responsible_am、team_set_am_not_required、team_onboarding_overview、team_onboarding_am_members
--   8. 回填：既有勾選（皆為一館一位，precheck 會擋重複）→ 負責 AM；已停用館別不轉；
--      補開 AM 缺少的 hotel_admin；既有 hotel_admin 一律保留、不刪除
-- 繞過 trigger 的旗標：set_config('lakeze.am_sync','on',true)，同步函式結束時還原為原值
-- 鎖與逾時：整支 BEGIN/COMMIT；lock_timeout 3s 拿不到鎖就整支放棄
--   CREATE TRIGGER 會短暫取得 accommodation_info／user_roles／team_member_profiles 的 SHARE ROW EXCLUSIVE（只改目錄）
-- rollback：docs/team-onboarding/rollback_20261021090000.sql（還原陣列備份、刪除系統開的 hotel_admin）
-- 本機測試：docs/team-onboarding/localtest/migration_test.sh
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

-- ============================= PRECHECK =============================
DO $$
DECLARE
  v_dup text;
BEGIN
  IF to_regclass('public.accommodation_responsible_am') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：accommodation_responsible_am 已存在，疑似已套用過本 migration';
  END IF;
  IF to_regclass('public.accommodation_info') IS NULL OR to_regclass('public.user_roles') IS NULL
     OR to_regclass('public.team_member_profiles') IS NULL OR to_regclass('public.audit_logs') IS NULL
     OR to_regclass('public.kol_venues') IS NULL OR to_regclass('public.kol_venue_settings') IS NULL
     OR to_regclass('public.kol_reciprocal_monthly_quotas') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：必要資料表不存在';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'accommodation_info' AND column_name = 'first_activated_at') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：accommodation_info.first_activated_at 不存在（需先套用 20261018120000）';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'team_member_profiles' AND column_name = 'am_managed_accommodation_ids') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：team_member_profiles.am_managed_accommodation_ids 不存在';
  END IF;
  IF to_regprocedure('public.enforce_manager_scoped_user_roles()') IS NULL
     OR to_regprocedure('public.enforce_am_managed_accommodations()') IS NULL
     OR to_regprocedure('public.am_manages_accommodation(uuid,uuid)') IS NULL
     OR to_regprocedure('public.is_super_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：必要函式不存在';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.user_roles'::regclass
                   AND conname = 'user_roles_user_id_accommodation_id_role_key') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：user_roles_user_id_accommodation_id_role_key 不存在';
  END IF;

  SELECT string_agg(a.name || '（' || x.n || ' 位）', '、') INTO v_dup
  FROM (
    SELECT acc_id, count(*) AS n
    FROM public.team_member_profiles p
    CROSS JOIN LATERAL unnest(p.am_managed_accommodation_ids) AS acc_id
    WHERE coalesce(p.is_active, true)
    GROUP BY acc_id
    HAVING count(*) > 1
  ) x
  JOIN public.accommodation_info a ON a.id = x.acc_id;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：以下館別有多位在職 AM 勾選，請先決定負責人再套用：%', v_dup;
  END IF;
END $$;

-- ============================= CHANGE =============================

-- ---------- 1. 資料表 ----------
CREATE TABLE public.accommodation_responsible_am (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.team_member_profiles(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  end_reason text CHECK (end_reason IN ('replaced', 'cleared', 'accommodation_inactive', 'member_not_eligible')),
  created_by uuid,
  ended_by uuid,
  CHECK ((ended_at IS NULL) = (end_reason IS NULL))
);
CREATE UNIQUE INDEX accommodation_responsible_am_current_key
  ON public.accommodation_responsible_am (accommodation_id) WHERE ended_at IS NULL;
CREATE INDEX accommodation_responsible_am_member_idx
  ON public.accommodation_responsible_am (member_id) WHERE ended_at IS NULL;
COMMENT ON TABLE public.accommodation_responsible_am IS
  '館別負責 AM（含歷史）。ended_at IS NULL = 目前負責人，一館只有一位。只能經 team_set_responsible_am 與系統 trigger 寫入。';

CREATE TABLE public.accommodation_am_settings (
  accommodation_id uuid PRIMARY KEY REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  am_not_required boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.accommodation_am_settings IS
  '館別 AM 設定：am_not_required = 不需要負責 AM（不提醒）。只能經 team_set_am_not_required 寫入。';

CREATE TABLE public.am_hotel_admin_grants (
  user_id uuid NOT NULL,
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, accommodation_id)
);
COMMENT ON TABLE public.am_hotel_admin_grants IS
  '系統為職代 AM 自動開的 hotel_admin。收回時只刪這些；HQ 手動開的不在此表、不會被收回。只有系統函式可存取。';

CREATE TABLE public.am_onboarding_migration_backup (
  profile_id uuid PRIMARY KEY,
  am_managed_accommodation_ids uuid[],
  backed_up_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.am_onboarding_migration_backup IS
  '20261021090000 套用前的 am_managed_accommodation_ids 備份，供 rollback 還原。只有 service role 可存取。';

ALTER TABLE public.accommodation_responsible_am ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_am_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.am_hotel_admin_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.am_onboarding_migration_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accommodation_responsible_am, public.accommodation_am_settings,
              public.am_hotel_admin_grants, public.am_onboarding_migration_backup FROM anon, authenticated;

INSERT INTO public.am_onboarding_migration_backup (profile_id, am_managed_accommodation_ids)
SELECT id, am_managed_accommodation_ids FROM public.team_member_profiles
WHERE am_managed_accommodation_ids IS NOT NULL;

-- ---------- 2. 判斷函式 ----------
-- 可檢視館別設定總覽的團隊角色
CREATE FUNCTION public.team_onboarding_can_view(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND accommodation_id IS NULL
      AND role IN ('admin', 'finance', 'am', 'am_manager', 'scout_manager', 'closer_manager')
  );
$$;

-- 可指定負責 AM／不需要負責 AM：super_admin、admin、am_manager
CREATE FUNCTION public.team_onboarding_can_assign_am(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND accommodation_id IS NULL AND role IN ('admin', 'am_manager')
  );
$$;

-- 職代協作成員：具團隊 am／am_manager 角色，且成員檔沒有被停用
CREATE FUNCTION public._am_collab_user_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ur.user_id
  FROM public.user_roles ur
  WHERE ur.accommodation_id IS NULL
    AND ur.role IN ('am', 'am_manager')
    AND NOT EXISTS (SELECT 1 FROM public.team_member_profiles p
                    WHERE p.user_id = ur.user_id AND p.is_active IS FALSE);
$$;

-- 職代協作的館別：開賣中，或上架中（從未開賣）
CREATE FUNCTION public._am_collab_accommodation_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.accommodation_info WHERE is_active IS TRUE OR first_activated_at IS NULL;
$$;

-- 可擔任負責 AM：在職、有帳號、具 am 角色、不是 am_manager
CREATE FUNCTION public._am_can_be_responsible(_member_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_member_profiles p
    WHERE p.id = _member_id AND p.user_id IS NOT NULL AND p.is_active IS NOT FALSE
      AND EXISTS (SELECT 1 FROM public.user_roles r
                  WHERE r.user_id = p.user_id AND r.accommodation_id IS NULL AND r.role = 'am')
      AND NOT EXISTS (SELECT 1 FROM public.user_roles r
                      WHERE r.user_id = p.user_id AND r.accommodation_id IS NULL AND r.role = 'am_manager')
  );
$$;

-- ---------- 3. 同步函式 ----------
-- 成員檔陣列 = 目前負責且開賣中的館別
CREATE FUNCTION public._am_sync_profile_arrays(_member_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev text := coalesce(current_setting('lakeze.am_sync', true), 'off');
BEGIN
  IF _member_ids IS NULL OR cardinality(_member_ids) = 0 THEN
    RETURN;
  END IF;
  PERFORM set_config('lakeze.am_sync', 'on', true);
  UPDATE public.team_member_profiles p
     SET am_managed_accommodation_ids = s.ids
    FROM (
      SELECT m.id,
             (SELECT array_agg(r.accommodation_id ORDER BY r.started_at, r.accommodation_id)
                FROM public.accommodation_responsible_am r
                JOIN public.accommodation_info a ON a.id = r.accommodation_id AND a.is_active IS TRUE
               WHERE r.member_id = m.id AND r.ended_at IS NULL) AS ids
      FROM public.team_member_profiles m
      WHERE m.id = ANY (_member_ids)
    ) s
   WHERE p.id = s.id AND p.am_managed_accommodation_ids IS DISTINCT FROM s.ids;
  PERFORM set_config('lakeze.am_sync', v_prev, true);
END;
$$;

-- 結束負責 AM（館別或成員其一可為 NULL 代表不限）
CREATE FUNCTION public._am_end_responsible(_accommodation_id uuid, _member_id uuid, _reason text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_members uuid[];
BEGIN
  WITH ended AS (
    UPDATE public.accommodation_responsible_am
       SET ended_at = now(), end_reason = _reason, ended_by = auth.uid()
     WHERE ended_at IS NULL
       AND (_accommodation_id IS NULL OR accommodation_id = _accommodation_id)
       AND (_member_id IS NULL OR member_id = _member_id)
    RETURNING member_id
  )
  SELECT array_agg(DISTINCT member_id) INTO v_members FROM ended;
  PERFORM public._am_sync_profile_arrays(v_members);
  RETURN coalesce(cardinality(v_members), 0);
END;
$$;

-- 職代 AM 的 hotel_admin：補開缺的、收回不再符合者的系統紀錄
CREATE FUNCTION public.sync_am_hotel_admin(_user_id uuid DEFAULT NULL, _accommodation_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev text := coalesce(current_setting('lakeze.am_sync', true), 'off');
  v_granted integer := 0;
  v_revoked integer := 0;
BEGIN
  PERFORM set_config('lakeze.am_sync', 'on', true);

  WITH want AS (
    SELECT u AS user_id, a AS accommodation_id
    FROM public._am_collab_user_ids() u
    CROSS JOIN public._am_collab_accommodation_ids() a
    WHERE (_user_id IS NULL OR u = _user_id)
      AND (_accommodation_id IS NULL OR a = _accommodation_id)
  ), ins AS (
    INSERT INTO public.user_roles (user_id, accommodation_id, role)
    SELECT w.user_id, w.accommodation_id, 'hotel_admin'::app_role
    FROM want w
    WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r
                      WHERE r.user_id = w.user_id AND r.accommodation_id = w.accommodation_id
                        AND r.role = 'hotel_admin')
    ON CONFLICT ON CONSTRAINT user_roles_user_id_accommodation_id_role_key DO NOTHING
    RETURNING user_id, accommodation_id
  ), rec AS (
    INSERT INTO public.am_hotel_admin_grants (user_id, accommodation_id)
    SELECT user_id, accommodation_id FROM ins
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_granted FROM rec;

  WITH gone AS (
    DELETE FROM public.am_hotel_admin_grants g
     WHERE (_user_id IS NULL OR g.user_id = _user_id)
       AND (_accommodation_id IS NULL OR g.accommodation_id = _accommodation_id)
       AND NOT EXISTS (SELECT 1 FROM public._am_collab_user_ids() u WHERE u = g.user_id)
    RETURNING g.user_id, g.accommodation_id
  ), del AS (
    DELETE FROM public.user_roles r
     USING gone
     WHERE r.user_id = gone.user_id AND r.accommodation_id = gone.accommodation_id AND r.role = 'hotel_admin'
    RETURNING 1
  )
  SELECT count(*) INTO v_revoked FROM del;

  PERFORM set_config('lakeze.am_sync', v_prev, true);
  RETURN jsonb_build_object('granted', v_granted, 'revoked', v_revoked);
END;
$$;

-- 成員角色或在職狀態變動後：不再符合就結束負責 AM，並同步 hotel_admin
CREATE FUNCTION public._am_refresh_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member uuid;
BEGIN
  IF _user_id IS NULL THEN
    RETURN;
  END IF;
  FOR v_member IN
    SELECT DISTINCT r.member_id
    FROM public.accommodation_responsible_am r
    JOIN public.team_member_profiles p ON p.id = r.member_id
    WHERE p.user_id = _user_id AND r.ended_at IS NULL
  LOOP
    IF NOT public._am_can_be_responsible(v_member) THEN
      PERFORM public._am_end_responsible(NULL, v_member, 'member_not_eligible');
    END IF;
  END LOOP;
  PERFORM public.sync_am_hotel_admin(_user_id, NULL);
END;
$$;

-- ---------- 4. trigger ----------
CREATE FUNCTION public._am_trg_user_roles()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.role = 'hotel_admin' AND OLD.accommodation_id IS NOT NULL THEN
    DELETE FROM public.am_hotel_admin_grants
     WHERE user_id = OLD.user_id AND accommodation_id = OLD.accommodation_id;
    RETURN OLD;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.role IN ('am', 'am_manager') AND OLD.accommodation_id IS NULL THEN
    PERFORM public._am_refresh_user(OLD.user_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.role IN ('am', 'am_manager') AND NEW.accommodation_id IS NULL
     AND (TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.role IS DISTINCT FROM OLD.role
          OR OLD.accommodation_id IS NOT NULL) THEN
    PERFORM public._am_refresh_user(NEW.user_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_am_sync_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public._am_trg_user_roles();

CREATE FUNCTION public._am_trg_profiles()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    PERFORM public._am_refresh_user(OLD.user_id);
  END IF;
  PERFORM public._am_refresh_user(NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_am_sync_profiles
  AFTER INSERT OR UPDATE OF is_active, user_id ON public.team_member_profiles
  FOR EACH ROW EXECUTE FUNCTION public._am_trg_profiles();

CREATE FUNCTION public._am_trg_accommodation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_members uuid[];
BEGIN
  IF TG_OP = 'INSERT' OR (NEW.is_active IS TRUE AND OLD.is_active IS NOT TRUE) THEN
    PERFORM public.sync_am_hotel_admin(NULL, NEW.id);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    IF OLD.is_active IS TRUE AND NEW.is_active IS NOT TRUE THEN
      PERFORM public._am_end_responsible(NEW.id, NULL, 'accommodation_inactive');
    ELSE
      SELECT array_agg(member_id) INTO v_members
        FROM public.accommodation_responsible_am
       WHERE accommodation_id = NEW.id AND ended_at IS NULL;
      PERFORM public._am_sync_profile_arrays(v_members);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_am_sync_accommodation
  AFTER INSERT OR UPDATE OF is_active ON public.accommodation_info
  FOR EACH ROW EXECUTE FUNCTION public._am_trg_accommodation();

-- ---------- 5. 既有函式調整 ----------
-- 5a. am_managed_accommodation_ids 只能由系統同步
CREATE OR REPLACE FUNCTION public.enforce_am_managed_accommodations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.am_managed_accommodation_ids IS NOT DISTINCT FROM OLD.am_managed_accommodation_ids THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.am_managed_accommodation_ids IS NULL THEN
    RETURN NEW;
  END IF;

  IF current_setting('lakeze.am_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION '負責館別改由「館別設定總覽」指定負責 AM，系統會自動同步（am_managed_accommodation_ids 不能直接修改）'
    USING ERRCODE = '42501';
END;
$$;

-- 5b. 主管範圍限制：系統同步（職代 hotel_admin）不受限
CREATE OR REPLACE FUNCTION public.enforce_manager_scoped_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  target_role app_role;
  target_acc uuid;
  allowed app_role[] := ARRAY[]::app_role[];
  err text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF current_setting('lakeze.am_sync', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Skip enforcement when actor has higher privilege
  IF user_has_team_role(auth.uid(), 'super_admin'::app_role)
     OR user_has_team_role(auth.uid(), 'admin'::app_role)
     OR user_has_team_role(auth.uid(), 'hotel_admin'::app_role) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Build the allowed child-role set from the actor's manager roles
  IF user_has_team_role(auth.uid(), 'scout_manager'::app_role) THEN
    allowed := allowed || 'scout'::app_role;
  END IF;
  IF user_has_team_role(auth.uid(), 'closer_manager'::app_role) THEN
    allowed := allowed || 'closer'::app_role;
  END IF;
  IF user_has_team_role(auth.uid(), 'am_manager'::app_role) THEN
    allowed := allowed || 'am'::app_role;
  END IF;

  -- Actor is not a scoped manager -> not restricted by this trigger
  IF array_length(allowed, 1) IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  err := '主管僅能操作 ' || array_to_string(allowed, '/') || ' 角色（全域）的記錄';

  IF TG_OP = 'DELETE' THEN
    target_role := OLD.role;
    target_acc := OLD.accommodation_id;
  ELSE
    target_role := NEW.role;
    target_acc := NEW.accommodation_id;
    IF TG_OP = 'UPDATE' AND (NOT (OLD.role = ANY (allowed)) OR OLD.accommodation_id IS NOT NULL) THEN
      RAISE EXCEPTION '%', err;
    END IF;
  END IF;

  IF NOT (target_role = ANY (allowed)) OR target_acc IS NOT NULL THEN
    RAISE EXCEPTION '%', err;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 5c. AM 協作：在職 am／am_manager 皆可協作所有館
CREATE OR REPLACE FUNCTION public.am_manages_accommodation(_user_id uuid, _accommodation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _accommodation_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id AND ur.accommodation_id IS NULL
        AND ur.role IN ('am'::app_role, 'am_manager'::app_role)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.team_member_profiles p
      WHERE p.user_id = _user_id AND p.is_active IS FALSE
    );
$$;

-- ---------- 6. RPC ----------
CREATE FUNCTION public.team_set_responsible_am(_accommodation_id uuid, _member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_acc record;
  v_cur record;
  v_new_user uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.team_onboarding_can_assign_am(v_uid) THEN
    RAISE EXCEPTION '只有 AM 總管或總部管理員可以指定負責 AM' USING ERRCODE = '42501';
  END IF;

  SELECT id, name, is_active, first_activated_at INTO v_acc
    FROM public.accommodation_info WHERE id = _accommodation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到館別';
  END IF;

  SELECT id, member_id INTO v_cur
    FROM public.accommodation_responsible_am
   WHERE accommodation_id = _accommodation_id AND ended_at IS NULL
   FOR UPDATE;

  IF _member_id IS NOT DISTINCT FROM v_cur.member_id THEN
    RETURN jsonb_build_object('ok', true, 'changed', false);
  END IF;

  IF _member_id IS NOT NULL THEN
    IF v_acc.is_active IS NOT TRUE AND v_acc.first_activated_at IS NOT NULL THEN
      RAISE EXCEPTION '已停用的館別不能指定負責 AM（停用時系統會自動取消負責人）';
    END IF;
    IF NOT public._am_can_be_responsible(_member_id) THEN
      RAISE EXCEPTION '只能指定在職、具 AM 角色的成員（AM 總管只領 AM 總管獎金，不能擔任負責 AM）';
    END IF;
  END IF;

  IF v_cur.id IS NOT NULL THEN
    PERFORM public._am_end_responsible(_accommodation_id, NULL,
      CASE WHEN _member_id IS NULL THEN 'cleared' ELSE 'replaced' END);
  END IF;

  IF _member_id IS NOT NULL THEN
    INSERT INTO public.accommodation_responsible_am (accommodation_id, member_id, created_by)
    VALUES (_accommodation_id, _member_id, v_uid);
    UPDATE public.accommodation_am_settings
       SET am_not_required = false, updated_by = v_uid, updated_at = now()
     WHERE accommodation_id = _accommodation_id AND am_not_required;
    PERFORM public._am_sync_profile_arrays(ARRAY[_member_id]);
    SELECT user_id INTO v_new_user FROM public.team_member_profiles WHERE id = _member_id;
    PERFORM public.sync_am_hotel_admin(v_new_user, _accommodation_id);
  END IF;

  INSERT INTO public.audit_logs (accommodation_id, user_id, user_email, action_type, action_category,
                                 entity_type, entity_id, entity_name, details)
  VALUES (_accommodation_id, v_uid, auth.jwt() ->> 'email', 'update', 'team',
          'responsible_am', _accommodation_id::text, v_acc.name,
          jsonb_build_object('previous_member_id', v_cur.member_id, 'member_id', _member_id));

  RETURN jsonb_build_object('ok', true, 'changed', true,
                            'previous_member_id', v_cur.member_id, 'member_id', _member_id);
END;
$$;

CREATE FUNCTION public.team_set_am_not_required(_accommodation_id uuid, _value boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.team_onboarding_can_assign_am(v_uid) THEN
    RAISE EXCEPTION '只有 AM 總管或總部管理員可以設定' USING ERRCODE = '42501';
  END IF;
  SELECT name INTO v_name FROM public.accommodation_info WHERE id = _accommodation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到館別';
  END IF;
  IF _value AND EXISTS (SELECT 1 FROM public.accommodation_responsible_am
                        WHERE accommodation_id = _accommodation_id AND ended_at IS NULL) THEN
    RAISE EXCEPTION '此館已有負責 AM，請先取消負責人再標記「不需要負責 AM」';
  END IF;

  INSERT INTO public.accommodation_am_settings (accommodation_id, am_not_required, updated_by, updated_at)
  VALUES (_accommodation_id, coalesce(_value, false), v_uid, now())
  ON CONFLICT (accommodation_id) DO UPDATE
    SET am_not_required = EXCLUDED.am_not_required, updated_by = v_uid, updated_at = now();

  INSERT INTO public.audit_logs (accommodation_id, user_id, user_email, action_type, action_category,
                                 entity_type, entity_id, entity_name, details)
  VALUES (_accommodation_id, v_uid, auth.jwt() ->> 'email', 'update', 'team',
          'am_not_required', _accommodation_id::text, v_name,
          jsonb_build_object('am_not_required', coalesce(_value, false)));

  RETURN jsonb_build_object('ok', true, 'am_not_required', coalesce(_value, false));
END;
$$;

-- 可擔任負責 AM 的成員（下拉選單）與全體職代成員
CREATE FUNCTION public.team_onboarding_am_members()
RETURNS TABLE (member_id uuid, user_id uuid, display_name text, is_am_manager boolean, can_be_responsible boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT public.team_onboarding_can_view(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.user_id, p.display_name,
         EXISTS (SELECT 1 FROM public.user_roles r
                 WHERE r.user_id = p.user_id AND r.accommodation_id IS NULL AND r.role = 'am_manager'),
         public._am_can_be_responsible(p.id)
  FROM public.team_member_profiles p
  WHERE p.user_id IN (SELECT public._am_collab_user_ids())
  ORDER BY p.display_name;
END;
$$;

CREATE FUNCTION public.team_onboarding_overview()
RETURNS TABLE (
  accommodation_id uuid,
  accommodation_name text,
  is_active boolean,
  first_activated_at timestamptz,
  responsible_member_id uuid,
  responsible_name text,
  responsible_since timestamptz,
  am_not_required boolean,
  am_total integer,
  am_with_access integer,
  am_missing_names text[],
  other_hotel_admin_names text[],
  other_hotel_admin_unnamed integer,
  kol_venue_id uuid,
  kol_venue_active boolean,
  kol_venue_has_settings boolean,
  kol_quota_this_month integer,
  payment_provider_active text,
  payuni_mer_id text,
  payuni_mer_status integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_month text := to_char(now() AT TIME ZONE 'Asia/Taipei', 'YYYY-MM');
BEGIN
  IF auth.uid() IS NULL OR NOT public.team_onboarding_can_view(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH collab AS (
    SELECT u AS user_id,
           coalesce((SELECT p.display_name FROM public.team_member_profiles p WHERE p.user_id = u LIMIT 1), u::text) AS name
    FROM public._am_collab_user_ids() u
  )
  SELECT a.id, a.name, a.is_active, a.first_activated_at,
         r.member_id, mp.display_name, r.started_at,
         coalesce(s.am_not_required, false),
         (SELECT count(*)::int FROM collab),
         (SELECT count(*)::int FROM collab c
           WHERE EXISTS (SELECT 1 FROM public.user_roles ur
                         WHERE ur.user_id = c.user_id AND ur.accommodation_id = a.id AND ur.role = 'hotel_admin')),
         (SELECT array_agg(c.name ORDER BY c.name) FROM collab c
           WHERE NOT EXISTS (SELECT 1 FROM public.user_roles ur
                             WHERE ur.user_id = c.user_id AND ur.accommodation_id = a.id AND ur.role = 'hotel_admin')),
         (SELECT array_agg(DISTINCT op.display_name ORDER BY op.display_name)
            FROM public.user_roles ur
            JOIN public.team_member_profiles op ON op.user_id = ur.user_id
           WHERE ur.accommodation_id = a.id AND ur.role = 'hotel_admin'
             AND ur.user_id NOT IN (SELECT c.user_id FROM collab c)),
         (SELECT count(DISTINCT ur.user_id)::int
            FROM public.user_roles ur
           WHERE ur.accommodation_id = a.id AND ur.role = 'hotel_admin'
             AND ur.user_id NOT IN (SELECT c.user_id FROM collab c)
             AND NOT EXISTS (SELECT 1 FROM public.team_member_profiles op WHERE op.user_id = ur.user_id)),
         kv.id, kv.is_active,
         (kv.id IS NOT NULL AND EXISTS (SELECT 1 FROM public.kol_venue_settings ks WHERE ks.venue_id = kv.id)),
         (SELECT coalesce(sum(q.quota), 0)::int FROM public.kol_reciprocal_monthly_quotas q
           WHERE q.accommodation_id = a.id AND q.year_month = v_month),
         a.payment_provider_active, a.payuni_mer_id, a.payuni_mer_status
  FROM public.accommodation_info a
  LEFT JOIN public.accommodation_responsible_am r ON r.accommodation_id = a.id AND r.ended_at IS NULL
  LEFT JOIN public.team_member_profiles mp ON mp.id = r.member_id
  LEFT JOIN public.accommodation_am_settings s ON s.accommodation_id = a.id
  LEFT JOIN LATERAL (
    SELECT v.id, v.is_active FROM public.kol_venues v
     WHERE v.accommodation_id = a.id AND v.room_type_id IS NULL
     ORDER BY v.is_active DESC NULLS LAST, v.created_at
     LIMIT 1
  ) kv ON true
  ORDER BY a.is_active DESC, a.name;
END;
$$;

-- ---------- 7. 權限 ----------
REVOKE ALL ON FUNCTION public._am_collab_user_ids(), public._am_collab_accommodation_ids(),
  public._am_can_be_responsible(uuid), public._am_sync_profile_arrays(uuid[]),
  public._am_end_responsible(uuid, uuid, text), public.sync_am_hotel_admin(uuid, uuid),
  public._am_refresh_user(uuid), public._am_trg_user_roles(), public._am_trg_profiles(),
  public._am_trg_accommodation()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_onboarding_can_view(uuid), public.team_onboarding_can_assign_am(uuid),
  public.team_set_responsible_am(uuid, uuid), public.team_set_am_not_required(uuid, boolean),
  public.team_onboarding_am_members(), public.team_onboarding_overview()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_onboarding_can_view(uuid), public.team_onboarding_can_assign_am(uuid),
  public.team_set_responsible_am(uuid, uuid), public.team_set_am_not_required(uuid, boolean),
  public.team_onboarding_am_members(), public.team_onboarding_overview()
  TO authenticated;

GRANT SELECT ON public.accommodation_responsible_am, public.accommodation_am_settings TO authenticated;
CREATE POLICY accommodation_responsible_am_team_select ON public.accommodation_responsible_am
  FOR SELECT TO authenticated USING (public.team_onboarding_can_view(auth.uid()));
CREATE POLICY accommodation_am_settings_team_select ON public.accommodation_am_settings
  FOR SELECT TO authenticated USING (public.team_onboarding_can_view(auth.uid()));

-- ---------- 8. 回填 ----------
DO $$
DECLARE
  v_skipped text;
BEGIN
  SELECT string_agg(p.display_name || '→' || a.name, '、') INTO v_skipped
  FROM public.team_member_profiles p
  CROSS JOIN LATERAL unnest(p.am_managed_accommodation_ids) AS acc_id
  JOIN public.accommodation_info a ON a.id = acc_id
  WHERE coalesce(p.is_active, true) AND (a.is_active IS NOT TRUE OR NOT public._am_can_be_responsible(p.id));
  IF v_skipped IS NOT NULL THEN
    RAISE NOTICE '回填略過（館別已停用或成員不符合負責 AM 資格）：%', v_skipped;
  END IF;
END $$;

INSERT INTO public.accommodation_responsible_am (accommodation_id, member_id, started_at)
SELECT DISTINCT acc_id, p.id, now()
FROM public.team_member_profiles p
CROSS JOIN LATERAL unnest(p.am_managed_accommodation_ids) AS acc_id
JOIN public.accommodation_info a ON a.id = acc_id AND a.is_active IS TRUE
WHERE coalesce(p.is_active, true) AND public._am_can_be_responsible(p.id);

SELECT public._am_sync_profile_arrays(
  (SELECT array_agg(id) FROM public.team_member_profiles WHERE am_managed_accommodation_ids IS NOT NULL)
  || (SELECT array_agg(DISTINCT member_id) FROM public.accommodation_responsible_am)
);

SELECT public.sync_am_hotel_admin(NULL, NULL);

-- ============================= POSTCHECK =============================
DO $$
DECLARE
  v_resp integer;
  v_grants integer;
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_resp FROM public.accommodation_responsible_am WHERE ended_at IS NULL;
  SELECT count(*) INTO v_grants FROM public.am_hotel_admin_grants;
  SELECT count(*) INTO v_bad
  FROM public.team_member_profiles p
  WHERE p.am_managed_accommodation_ids IS DISTINCT FROM (
    SELECT array_agg(r.accommodation_id ORDER BY r.started_at, r.accommodation_id)
    FROM public.accommodation_responsible_am r
    JOIN public.accommodation_info a ON a.id = r.accommodation_id AND a.is_active IS TRUE
    WHERE r.member_id = p.id AND r.ended_at IS NULL);
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：% 位成員的 am_managed_accommodation_ids 與負責 AM 表不一致', v_bad;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public._am_collab_user_ids() u CROSS JOIN public._am_collab_accommodation_ids() a
    WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r
                      WHERE r.user_id = u AND r.accommodation_id = a AND r.role = 'hotel_admin')) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：仍有職代 AM 缺少 hotel_admin';
  END IF;
  RAISE NOTICE 'POSTCHECK 通過：負責 AM % 筆、系統補開 hotel_admin % 筆', v_resp, v_grants;
END $$;

COMMIT;
