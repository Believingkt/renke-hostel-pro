-- Phase 3C-1 DRAFT — verification design（未來執行，全部 write 必須 ROLLBACK）

-- ============ A. Policy 對帳 ============
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies WHERE tablename = 'order_rooms' ORDER BY cmd, policyname;

-- 預期（STEP 4 後）：
--   SELECT: Order rooms visible to staff and finance（未變）
--   INSERT: Admins can insert order rooms / Staff orders editors can insert order rooms
--   UPDATE: Admins can update order rooms / Staff orders editors can update order rooms
--   DELETE: Admins can delete order rooms / Staff orders editors can delete order rooms
--   不得存在任何 user_has_access_to_accommodation 的 write policy

-- ============ B. RPC 定義與授權 ============
SELECT p.prosecdef, p.proconfig, pg_get_function_identity_arguments(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'clear_order_room_pricing_template';
-- 預期：prosecdef = t，proconfig 含 search_path=public

SELECT grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_name = 'clear_order_room_pricing_template';
-- 預期：只有 authenticated（無 PUBLIC / anon）

-- ============ C. RPC Authorization Matrix（每個 persona 以真實 JWT claims 執行） ============
-- 樣板：
-- BEGIN;
--   SELECT set_config('request.jwt.claims', json_build_object('sub','<uid>','role','authenticated')::text, true);
--   SET LOCAL ROLE authenticated;
--   SELECT public.clear_order_room_pricing_template('<template_uuid>');
-- ROLLBACK;
--
-- CASE A super_admin                          → ALLOW
-- CASE B target hotel_admin                   → ALLOW
-- CASE C 跨館 hotel_admin                      → DENY 42501
-- CASE D room_price = editable Staff          → ALLOW
-- CASE E room_price = readonly Staff          → DENY 42501
-- CASE F room_price = hidden Staff            → DENY 42501
-- CASE G pricing=editable + room_price=readonly → DENY 42501
-- CASE H orders=editable + room_price=readonly  → DENY 42501
-- CASE I anonymous（SET LOCAL ROLE anon）       → DENY（no EXECUTE）

-- ============ D. RPC Data Behavior ============
-- CASE J：同館 3 筆引用 → 回傳 3，且三列僅 template_id / template_name 變 NULL
-- BEGIN;
--   SELECT id, order_id, room_type_id, room_unit_id, quantity, room_price, created_at
--     FROM public.order_rooms WHERE template_id = '<tpl>' ORDER BY id;   -- before
--   SELECT public.clear_order_room_pricing_template('<tpl>');
--   SELECT id, order_id, room_type_id, room_unit_id, quantity, room_price, created_at,
--          template_id, template_name
--     FROM public.order_rooms WHERE id IN (...) ORDER BY id;             -- after
-- ROLLBACK;
-- CASE K：無引用 → 回傳 0，無 error
-- CASE L：不存在的 template → ERROR P0002
-- CASE M：跨館異常引用 → 只清 template 所屬館別的列（見 E 的 anomaly query）

-- ============ E. Production anomaly（唯讀） ============
SELECT count(*) AS orphan_template_id
FROM public.order_rooms orr
WHERE orr.template_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.pricing_templates pt WHERE pt.id = orr.template_id);

SELECT count(*) AS cross_accommodation_refs
FROM public.order_rooms orr
JOIN public.orders o ON o.id = orr.order_id
JOIN public.pricing_templates pt ON pt.id = orr.template_id
WHERE pt.accommodation_id <> o.accommodation_id;

SELECT count(*) AS null_id_nonnull_name
FROM public.order_rooms
WHERE template_id IS NULL AND template_name IS NOT NULL;

-- ============ F. Future Staff RLS Matrix（rollback transaction 驗證） ============
-- orders=editable / room_price=readonly → INSERT/UPDATE/DELETE ALLOW，RPC DENY
-- orders=readonly / room_price=editable → direct write DENY，RPC ALLOW
-- both readonly                          → direct write DENY，RPC DENY
-- orders=hidden / room_price=editable    → direct write DENY，RPC ALLOW
-- orders=editable / room_price=hidden    → direct write ALLOW，RPC DENY
-- 跨館 UPDATE：把 order_id 改成他館 order → WITH CHECK 擋下
