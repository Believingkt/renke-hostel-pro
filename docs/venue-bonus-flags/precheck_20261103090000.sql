SELECT '1. 兩張新表尚不存在' AS item, to_regclass('public.teamcommission_venue_bonus_flags') IS NULL AND to_regclass('public.teamcommission_venue_revenue_source_overrides') IS NULL AS ok
UNION ALL SELECT '2. user_has_team_role(uuid, app_role)、is_super_admin(uuid) 存在', to_regprocedure('public.user_has_team_role(uuid, public.app_role)') IS NOT NULL AND to_regprocedure('public.is_super_admin(uuid)') IS NOT NULL
UNION ALL SELECT '3. app_role 含 admin、am、am_manager、closer、closer_manager、scout、scout_manager、finance', (SELECT count(*) FROM pg_enum WHERE enumtypid = 'public.app_role'::regtype AND enumlabel IN ('admin', 'am', 'am_manager', 'closer', 'closer_manager', 'scout', 'scout_manager', 'finance')) = 8;

SELECT a.id, a.name, a.is_active FROM public.accommodation_info a WHERE a.name LIKE '旅行日%' ORDER BY a.name;
