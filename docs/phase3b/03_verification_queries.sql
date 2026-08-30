-- Phase 3B-1 DRAFT verification design (READ-ONLY unless explicitly applying). Not a migration.

-- 0) Pre-flight: known duplicate same-accommodation phones (RPC must ERROR on these)
SELECT accommodation_id, phone, count(*)
FROM public.customers
WHERE phone IS NOT NULL AND phone <> ''
GROUP BY 1, 2 HAVING count(*) > 1
ORDER BY 3 DESC;

-- 1) Policy inventory (before / after STEP 4)
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'customers'
ORDER BY cmd, policyname;

-- 2) Persona picker: staff with orders/customers module levels
WITH staff AS (
  SELECT ur.user_id, ur.accommodation_id
  FROM public.user_roles ur
  WHERE ur.role = 'staff' AND ur.accommodation_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.user_roles s
                    WHERE s.user_id = ur.user_id AND s.role IN ('super_admin','hotel_admin'))
)
SELECT user_id, accommodation_id,
       public.get_staff_module_permission(user_id, accommodation_id, 'orders')    AS orders_level,
       public.get_staff_module_permission(user_id, accommodation_id, 'customers') AS customers_level
FROM staff
ORDER BY orders_level, customers_level;

-- 3) RPC test matrix template (run ONLY when authorized; always ROLLBACK)
/*
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;
  SET LOCAL request.jwt.claims = '{"sub":"<USER_UUID>","role":"authenticated"}';

  SELECT * FROM public.upsert_customer_for_order(
    '<ACC_UUID>', 'RLS Test', '<PHONE>', 'test@example.com', NULL, NULL, current_date);
ROLLBACK;
*/
-- CASE A super_admin                            -> ALLOW
-- CASE B target hotel_admin                     -> ALLOW
-- CASE C other-accommodation hotel_admin        -> DENY (42501)
-- CASE D staff orders=editable                  -> ALLOW
-- CASE E staff orders=readonly                  -> DENY (42501)
-- CASE F staff orders=hidden                    -> DENY (42501)
-- CASE G customers=editable + orders=readonly   -> DENY (42501)   <= key isolation
-- CASE H customers=readonly + orders=editable   -> ALLOW          <= key isolation
-- CASE I existing unique phone same accommodation -> action='updated', visit_count +1
-- CASE J no matching phone                      -> action='created', visit_count=1
-- CASE K duplicate phone (>1) same accommodation -> ERROR 21000
-- CASE L staff orders=editable at A, call with B -> DENY (42501)

-- 4) Future customers direct-table RLS matrix (after STEP 4)
--    customers=editable  INSERT/UPDATE = ALLOW
--    customers=readonly  INSERT/UPDATE = DENY
--    customers=hidden    INSERT/UPDATE = DENY
--    orders=editable + customers=readonly: direct INSERT/UPDATE = DENY,
--      but upsert_customer_for_order = ALLOW
/*
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL row_security = on;
  SET LOCAL request.jwt.claims = '{"sub":"<USER_UUID>","role":"authenticated"}';
  INSERT INTO public.customers (accommodation_id, name, phone, visit_count)
  VALUES ('<ACC_UUID>', 'RLS Test', '<PHONE>', 1) RETURNING id;
  UPDATE public.customers SET name = name WHERE accommodation_id = '<ACC_UUID>' RETURNING id;
ROLLBACK;
*/

-- 5) Post-test cleanliness
SELECT count(*) FROM public.customers WHERE name = 'RLS Test';
