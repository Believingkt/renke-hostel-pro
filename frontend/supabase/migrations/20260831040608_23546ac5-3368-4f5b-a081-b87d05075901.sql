DROP POLICY IF EXISTS "Admins manage their accommodation api keys" ON public.accommodation_ai_api_keys;
DROP POLICY IF EXISTS "HQ admins manage all ai api keys" ON public.accommodation_ai_api_keys;

CREATE POLICY "ai_api_keys_super_admin_all"
ON public.accommodation_ai_api_keys
FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));