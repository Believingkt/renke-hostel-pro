-- rollback for 20261014090001_save_package_tier_prices.sql
DROP FUNCTION IF EXISTS public.save_package_tier_prices(uuid, jsonb);
