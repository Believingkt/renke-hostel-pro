-- 20261029090000 rollback：只移除新增的 update_order_referral_code_v1；未修改任何既有函式或觸發器，無須還原其他物件
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';
DROP FUNCTION IF EXISTS public.update_order_referral_code_v1(uuid, timestamp with time zone, text, text, boolean, boolean);
COMMIT;
