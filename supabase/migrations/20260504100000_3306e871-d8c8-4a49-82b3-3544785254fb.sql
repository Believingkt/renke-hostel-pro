-- Channel Manager: OTA channels per accommodation
CREATE TABLE public.ota_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID NOT NULL,
  channel_code TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  hotel_id TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  logo_url TEXT,
  notes TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (accommodation_id, channel_code)
);

CREATE INDEX idx_ota_channels_accommodation ON public.ota_channels(accommodation_id);

ALTER TABLE public.ota_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ota channels"
ON public.ota_channels FOR SELECT TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Admins can insert ota channels"
ON public.ota_channels FOR INSERT TO authenticated
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Admins can update ota channels"
ON public.ota_channels FOR UPDATE TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Admins can delete ota channels"
ON public.ota_channels FOR DELETE TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE TRIGGER update_ota_channels_updated_at
BEFORE UPDATE ON public.ota_channels
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();