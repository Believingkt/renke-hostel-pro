-- Phase 3A verification (READ-ONLY unless noted). Not a migration.

-- 1) Policy inventory after apply (expect: mappings = 1 SELECT + 3 admin write;
--    addon_sales = 3 SELECT + 3 addon_center write)
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('external_hotel_mappings', 'addon_sales')
ORDER BY tablename, cmd, policyname;

-- 2) Staff x accommodation permission distribution (pre/post identical; RLS only)
WITH staff AS (
  SELECT ur.user_id, ur.accommodation_id
  FROM public.user_roles ur
  WHERE ur.role = 'staff' AND ur.accommodation_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.user_roles s
                    WHERE s.user_id = ur.user_id AND s.role = 'super_admin')
)
SELECT
  public.get_staff_module_permission(user_id, accommodation_id, 'channel_manager') AS cm_level,
  public.get_staff_module_permission(user_id, accommodation_id, 'addon_center')    AS addon_level,
  count(*)
FROM staff
GROUP BY 1, 2 ORDER BY 1, 2;

-- 3) Authenticated transaction test template (run ONLY when applying; always ROLLBACK)
--    Repeat per persona: super_admin / target hotel_admin / other hotel_admin /
--    staff cm=editable / staff cm=readonly / staff cm=hidden /
--    staff addon=editable / readonly / hidden
/*
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;
  SET LOCAL request.jwt.claims = '{"sub":"<USER_UUID>","role":"authenticated"}';

  -- SELECT must stay ALLOW for every persona that could read before
  SELECT count(*) FROM public.external_hotel_mappings WHERE accommodation_id = '<ACC_UUID>';
  SELECT count(*) FROM public.addon_sales             WHERE accommodation_id = '<ACC_UUID>';

  -- WRITE attempts (expect 0 rows / RLS error per matrix)
  UPDATE public.external_hotel_mappings SET updated_at = now()
   WHERE accommodation_id = '<ACC_UUID>' RETURNING id;

  UPDATE public.addon_sales SET notes = notes
   WHERE accommodation_id = '<ACC_UUID>' RETURNING id;
ROLLBACK;
*/
