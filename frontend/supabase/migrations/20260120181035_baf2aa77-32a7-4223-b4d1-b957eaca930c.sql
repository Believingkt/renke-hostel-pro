-- Allow admins to create booking_settings rows (required for upsert when no row exists)
-- RLS is already enabled on public.booking_settings

DO $$
BEGIN
  -- Create INSERT policy if it doesn't exist
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'booking_settings'
      AND policyname = 'Only admins can insert booking settings'
  ) THEN
    CREATE POLICY "Only admins can insert booking settings"
    ON public.booking_settings
    FOR INSERT
    TO authenticated
    WITH CHECK (
      user_has_role(auth.uid(), accommodation_id, 'super_admin'::public.app_role)
      OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::public.app_role)
    );
  END IF;
END $$;