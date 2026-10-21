-- 20261103090000 rollback：刪除兩張新表（edge function／前端需同時退回舊版，否則讀不到表會報錯或改回全站設定）
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';
DROP TABLE IF EXISTS public.teamcommission_venue_revenue_source_overrides;
DROP TABLE IF EXISTS public.teamcommission_venue_bonus_flags;
COMMIT;
