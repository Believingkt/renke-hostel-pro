CREATE TABLE public.ota_channel_dismissed_defaults (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID NOT NULL,
  channel_code TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (accommodation_id, channel_code)
);

CREATE INDEX idx_ota_dismissed_acc ON public.ota_channel_dismissed_defaults(accommodation_id);

ALTER TABLE public.ota_channel_dismissed_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view dismissed defaults"
ON public.ota_channel_dismissed_defaults FOR SELECT TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Admins can insert dismissed defaults"
ON public.ota_channel_dismissed_defaults FOR INSERT TO authenticated
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Admins can delete dismissed defaults"
ON public.ota_channel_dismissed_defaults FOR DELETE TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);