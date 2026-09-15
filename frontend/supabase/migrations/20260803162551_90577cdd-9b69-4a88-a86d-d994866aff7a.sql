CREATE TABLE public.traveler_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  budget numeric,
  party_size int,
  festival text,
  purpose text,
  companion_type text,
  trip_duration text,
  highlights text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_traveler_attributes_user_id ON public.traveler_attributes(user_id);
CREATE INDEX idx_traveler_attributes_session_id ON public.traveler_attributes(session_id);
CREATE INDEX idx_traveler_attributes_created_at ON public.traveler_attributes(created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.traveler_attributes TO authenticated;
GRANT INSERT ON public.traveler_attributes TO anon;
GRANT ALL ON public.traveler_attributes TO service_role;

ALTER TABLE public.traveler_attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own traveler attributes"
ON public.traveler_attributes FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own traveler attributes"
ON public.traveler_attributes FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can update their own traveler attributes"
ON public.traveler_attributes FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Guests can insert anonymous traveler attributes"
ON public.traveler_attributes FOR INSERT TO anon
WITH CHECK (user_id IS NULL AND session_id IS NOT NULL);

CREATE POLICY "Admins can view all traveler attributes"
ON public.traveler_attributes FOR SELECT TO authenticated
USING (public.is_admin_or_super());