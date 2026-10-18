-- 20261018120002 rollback：還原為 20261018090000 的 accommodation_info_guard_is_active()（first_activated_at 欄位保留，由 120000 rollback 處理）
BEGIN;
CREATE OR REPLACE FUNCTION public.accommodation_info_guard_is_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR public.is_super_admin(v_uid) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_active IS TRUE THEN
      RAISE EXCEPTION '只有總部最高管理員可以核准開賣（only_super_admin_can_change_is_active）'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION '只有總部最高管理員可以核准或暫停開賣（only_super_admin_can_change_is_active）'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.accommodation_info_guard_is_active() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.accommodation_info_guard_is_active() IS
  '上架引導第一批：is_active（開賣）只限 super_admin 變更；auth.uid() 為 NULL 的系統身分不受限';
COMMIT;
