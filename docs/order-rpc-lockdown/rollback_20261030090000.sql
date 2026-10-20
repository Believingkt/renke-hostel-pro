-- 20261030090000 rollback：恢復套用前的對外執行權限（函式內容未曾修改，無須還原）
-- 依 precheck 第二段「目前授權」：若原本含 PUBLIC（=X/…）或為 NULL，保留下列 PUBLIC 兩行；若原本沒有 PUBLIC，刪除含 PUBLIC 的兩行。
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';
GRANT EXECUTE ON FUNCTION public.update_order_with_context(uuid, jsonb, text, text, text, text, jsonb, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_order_with_context(uuid, jsonb, text, text, text, text, jsonb, jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_order_dates(uuid, date, date, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.change_order_dates(uuid, date, date, text, text, text) TO PUBLIC;
COMMIT;
