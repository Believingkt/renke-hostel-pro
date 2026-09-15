CREATE TABLE public.accommodation_api_key_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES public.accommodation_api_keys(id) ON DELETE CASCADE,
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (api_key_id, accommodation_id)
);

CREATE INDEX idx_accommodation_api_key_scopes_key ON public.accommodation_api_key_scopes(api_key_id);

COMMENT ON TABLE public.accommodation_api_key_scopes IS
  '多館範圍金鑰：一把 accommodation_api_keys 金鑰額外被授權讀取的館別清單。有效範圍 = 主館別 ∪ 本表列。';

GRANT SELECT, INSERT, DELETE ON public.accommodation_api_key_scopes TO authenticated;
GRANT ALL ON public.accommodation_api_key_scopes TO service_role;

ALTER TABLE public.accommodation_api_key_scopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view api key scopes"
ON public.accommodation_api_key_scopes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.accommodation_api_keys k
    WHERE k.id = accommodation_api_key_scopes.api_key_id
      AND (
        public.user_has_role(auth.uid(), k.accommodation_id, 'super_admin'::app_role)
        OR public.user_has_role(auth.uid(), k.accommodation_id, 'hotel_admin'::app_role)
      )
  )
);

CREATE POLICY "Admins can insert api key scopes"
ON public.accommodation_api_key_scopes
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.accommodation_api_keys k
    WHERE k.id = accommodation_api_key_scopes.api_key_id
      AND (
        public.user_has_role(auth.uid(), k.accommodation_id, 'super_admin'::app_role)
        OR public.user_has_role(auth.uid(), k.accommodation_id, 'hotel_admin'::app_role)
      )
  )
  AND (
    public.user_has_role(auth.uid(), accommodation_api_key_scopes.accommodation_id, 'super_admin'::app_role)
    OR public.user_has_role(auth.uid(), accommodation_api_key_scopes.accommodation_id, 'hotel_admin'::app_role)
  )
);

CREATE POLICY "Admins can delete api key scopes"
ON public.accommodation_api_key_scopes
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.accommodation_api_keys k
    WHERE k.id = accommodation_api_key_scopes.api_key_id
      AND (
        public.user_has_role(auth.uid(), k.accommodation_id, 'super_admin'::app_role)
        OR public.user_has_role(auth.uid(), k.accommodation_id, 'hotel_admin'::app_role)
      )
  )
);