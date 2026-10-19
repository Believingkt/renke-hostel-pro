-- ============================================================
-- rollback：20261021090000_team_am_onboarding.sql
--   1. 移除三個同步 trigger
--   2. 刪除系統自動開的 hotel_admin（am_hotel_admin_grants 內的紀錄）；HQ 手動開的不動
--   3. am_managed_accommodation_ids 還原為套用前備份（套用後才建立的成員檔 → 清為 NULL）
--   4. 還原 enforce_am_managed_accommodations／enforce_manager_scoped_user_roles／am_manages_accommodation 原定義
--   5. 移除新函式與新資料表（負責 AM 歷史會一併刪除）
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regclass('public.am_onboarding_migration_backup') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK 失敗：找不到 am_onboarding_migration_backup，疑似未套用 20261021090000';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_am_sync_user_roles ON public.user_roles;
DROP TRIGGER IF EXISTS trg_am_sync_profiles ON public.team_member_profiles;
DROP TRIGGER IF EXISTS trg_am_sync_accommodation ON public.accommodation_info;

SELECT set_config('lakeze.am_sync', 'on', true);

DELETE FROM public.user_roles r
 USING public.am_hotel_admin_grants g
 WHERE r.user_id = g.user_id AND r.accommodation_id = g.accommodation_id AND r.role = 'hotel_admin';

UPDATE public.team_member_profiles p
   SET am_managed_accommodation_ids = b.am_managed_accommodation_ids
  FROM public.am_onboarding_migration_backup b
 WHERE b.profile_id = p.id AND p.am_managed_accommodation_ids IS DISTINCT FROM b.am_managed_accommodation_ids;

UPDATE public.team_member_profiles p
   SET am_managed_accommodation_ids = NULL
 WHERE p.am_managed_accommodation_ids IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.am_onboarding_migration_backup b WHERE b.profile_id = p.id);

SELECT set_config('lakeze.am_sync', 'off', true);

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

  IF NOT (public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
       OR public.user_has_team_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION '只有管理員可以設定 AM 管理場域';
  END IF;

  RETURN NEW;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.am_manages_accommodation(_user_id uuid, _accommodation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_member_profiles p
    WHERE p.user_id = _user_id
      AND COALESCE(p.is_active, true)
      AND _accommodation_id = ANY (COALESCE(p.am_managed_accommodation_ids, ARRAY[]::uuid[]))
  )
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('am'::app_role, 'am_manager'::app_role)
  );
$$;

DROP FUNCTION IF EXISTS public.team_onboarding_overview();
DROP FUNCTION IF EXISTS public.team_onboarding_am_members();
DROP FUNCTION IF EXISTS public.team_set_am_not_required(uuid, boolean);
DROP FUNCTION IF EXISTS public.team_set_responsible_am(uuid, uuid);
DROP FUNCTION IF EXISTS public._am_trg_accommodation();
DROP FUNCTION IF EXISTS public._am_trg_profiles();
DROP FUNCTION IF EXISTS public._am_trg_user_roles();
DROP FUNCTION IF EXISTS public._am_refresh_user(uuid);
DROP FUNCTION IF EXISTS public.sync_am_hotel_admin(uuid, uuid);
DROP FUNCTION IF EXISTS public._am_end_responsible(uuid, uuid, text);
DROP FUNCTION IF EXISTS public._am_sync_profile_arrays(uuid[]);
DROP FUNCTION IF EXISTS public._am_can_be_responsible(uuid);
DROP FUNCTION IF EXISTS public._am_collab_accommodation_ids();
DROP FUNCTION IF EXISTS public._am_collab_user_ids();

DROP TABLE IF EXISTS public.accommodation_responsible_am;
DROP TABLE IF EXISTS public.accommodation_am_settings;
DROP TABLE IF EXISTS public.am_hotel_admin_grants;
DROP TABLE IF EXISTS public.am_onboarding_migration_backup;

DROP FUNCTION IF EXISTS public.team_onboarding_can_assign_am(uuid);
DROP FUNCTION IF EXISTS public.team_onboarding_can_view(uuid);

COMMIT;
