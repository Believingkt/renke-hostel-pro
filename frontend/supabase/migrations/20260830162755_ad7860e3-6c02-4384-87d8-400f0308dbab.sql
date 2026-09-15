DROP POLICY IF EXISTS "Staff can insert customers in their accommodation" ON public.customers;
DROP POLICY IF EXISTS "Staff can update customers in their accommodation" ON public.customers;

CREATE POLICY "Staff customers editors can insert customers"
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (public.staff_can_edit_module(accommodation_id, 'customers'));

CREATE POLICY "Staff customers editors can update customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (public.staff_can_edit_module(accommodation_id, 'customers'))
WITH CHECK (public.staff_can_edit_module(accommodation_id, 'customers'));