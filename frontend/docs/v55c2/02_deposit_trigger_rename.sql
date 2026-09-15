-- V5.5C.2 item 2（設計稿，未套用）
-- 讓訂金驗證 trigger 排在房價/加購重算之後才執行
-- BEFORE INSERT trigger 依 tgname 字母序執行：
--   目前 trg_validate_order_deposit_on_insert < validate_order_before_insert_trigger
--   改名為 zzz_ 後排到最後

-- ===== PRECHECK =====
SELECT tgname,
       row_number() OVER (ORDER BY tgname) AS exec_order,
       pg_get_triggerdef(oid) AS def
FROM pg_trigger
WHERE tgrelid = 'public.orders'::regclass
  AND NOT tgisinternal
  AND (tgtype & 2) = 2   -- BEFORE
  AND (tgtype & 4) = 4   -- INSERT
ORDER BY tgname;
-- 期望看到（施工前）：
--   1 orders_set_cancelled_at_trg
--   2 set_order_exchange_rate_snapshot
--   3 set_order_number_trigger
--   4 trg_orders_autofill_package_id
--   5 trg_orders_owlting_set_unique_id
--   6 trg_orders_prevent_double_submit
--   7 trg_orders_website_inventory_gate
--   8 trg_sync_order_payment_fields
--   9 trg_validate_order_deposit_on_insert      <= 在重算之前
--  10 validate_order_before_insert
--  11 validate_order_before_insert_trigger

-- ===== MIGRATION =====
ALTER TRIGGER trg_validate_order_deposit_on_insert
  ON public.orders
  RENAME TO zzz_validate_order_deposit_on_insert;

-- ===== POSTCHECK =====
SELECT tgname, row_number() OVER (ORDER BY tgname) AS exec_order
FROM pg_trigger
WHERE tgrelid = 'public.orders'::regclass
  AND NOT tgisinternal
  AND (tgtype & 2) = 2 AND (tgtype & 4) = 4
ORDER BY tgname;
-- 期望：zzz_validate_order_deposit_on_insert 為最後一筆（exec_order = 11）

SELECT count(*) AS must_be_zero
FROM pg_trigger
WHERE tgrelid = 'public.orders'::regclass
  AND tgname = 'trg_validate_order_deposit_on_insert';

-- ===== ROLLBACK =====
-- ALTER TRIGGER zzz_validate_order_deposit_on_insert
--   ON public.orders
--   RENAME TO trg_validate_order_deposit_on_insert;
