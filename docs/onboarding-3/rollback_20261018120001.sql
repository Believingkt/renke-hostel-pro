-- 20261018120001 rollback（須先 rollback 120002）
BEGIN;
DROP FUNCTION IF EXISTS public.wizard_return(uuid, text);
DROP FUNCTION IF EXISTS public.wizard_submit(uuid, boolean);
DROP FUNCTION IF EXISTS public.wizard_precheck(uuid);
DROP FUNCTION IF EXISTS public.wizard_precheck_core(uuid);
DROP FUNCTION IF EXISTS public.wizard_open_inventory(uuid, date, date);
DROP FUNCTION IF EXISTS public.wizard_apply_season_prices(uuid, date, date, numeric, numeric);
DROP FUNCTION IF EXISTS public.wizard_preview_season_prices(uuid, date, date, numeric, numeric);
DROP FUNCTION IF EXISTS public.wizard_season_plan(uuid, date, date, numeric, numeric, boolean);
DROP FUNCTION IF EXISTS public.wizard_save_package(uuid, uuid, text, uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.wizard_clean_tier_prices(jsonb);
DROP FUNCTION IF EXISTS public.wizard_save_room_type(uuid, uuid, text, integer, integer, integer);
DROP FUNCTION IF EXISTS public.wizard_assert_access(uuid, boolean);
COMMIT;
