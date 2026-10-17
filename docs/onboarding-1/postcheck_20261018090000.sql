-- postcheck（唯讀）：20261018090000_accommodation_is_active_guard.sql
-- 套用後在正式庫執行，結果應為：trigger 1 列、enabled = O、函式 SECURITY DEFINER；館別數與啟用數和 precheck 相同
SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS def
FROM pg_trigger
WHERE tgrelid = 'public.accommodation_info'::regclass
  AND tgname = 'trg_accommodation_info_guard_is_active';

SELECT proname, prosecdef
FROM pg_proc
WHERE oid = 'public.accommodation_info_guard_is_active()'::regprocedure;

SELECT count(*) AS n_all, count(*) FILTER (WHERE is_active) AS n_active
FROM public.accommodation_info;
