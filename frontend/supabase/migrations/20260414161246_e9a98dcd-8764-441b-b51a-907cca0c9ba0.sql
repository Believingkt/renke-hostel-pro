
-- 1. Fix order_rooms anonymous INSERT policy
-- Remove the overly permissive policy
DROP POLICY IF EXISTS "Public can insert order rooms for new bookings" ON public.order_rooms;

-- Add a safer policy: only allow inserting rooms for orders created in the last 5 minutes
CREATE POLICY "Public can insert order rooms for recent bookings"
ON public.order_rooms
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_rooms.order_id
      AND o.created_at >= (now() - interval '5 minutes')
  )
);

-- 2. Fix order_rooms anonymous SELECT policy
DROP POLICY IF EXISTS "Public can view own order rooms" ON public.order_rooms;

-- Add a safer policy: only allow reading rooms for recently created orders
CREATE POLICY "Public can view recent order rooms"
ON public.order_rooms
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_rooms.order_id
      AND o.created_at >= (now() - interval '10 minutes')
  )
);

-- 3. Fix transfer-receipts storage upload policy
DROP POLICY IF EXISTS "Upload transfer receipts with valid path" ON storage.objects;

CREATE POLICY "Upload transfer receipts with valid path"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'transfer-receipts'
  AND EXISTS (
    SELECT 1 FROM public.accommodation_info ai
    JOIN public.user_roles ur ON ur.accommodation_id = ai.id
    WHERE ur.user_id = auth.uid()
      AND (ai.id)::text = (storage.foldername(name))[1]
      AND ai.is_active = true
  )
);

-- 4. Fix function search_path for validate_order_before_insert
ALTER FUNCTION public.validate_order_before_insert() SET search_path = 'public';

-- 5. Fix function search_path for validate_order_insert
ALTER FUNCTION public.validate_order_insert() SET search_path = 'public';
