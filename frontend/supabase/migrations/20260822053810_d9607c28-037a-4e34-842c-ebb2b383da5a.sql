CREATE TABLE public.accommodation_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL UNIQUE REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  booking_notification_emails text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accommodation_notification_settings TO authenticated;
GRANT ALL ON public.accommodation_notification_settings TO service_role;

ALTER TABLE public.accommodation_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view accommodation notification settings"
  ON public.accommodation_notification_settings FOR SELECT TO authenticated
  USING (is_admin_or_super() OR is_hotel_admin_of(accommodation_id));

CREATE POLICY "Managers can insert accommodation notification settings"
  ON public.accommodation_notification_settings FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_super() OR is_hotel_admin_of(accommodation_id));

CREATE POLICY "Managers can update accommodation notification settings"
  ON public.accommodation_notification_settings FOR UPDATE TO authenticated
  USING (is_admin_or_super() OR is_hotel_admin_of(accommodation_id))
  WITH CHECK (is_admin_or_super() OR is_hotel_admin_of(accommodation_id));

CREATE POLICY "Managers can delete accommodation notification settings"
  ON public.accommodation_notification_settings FOR DELETE TO authenticated
  USING (is_admin_or_super() OR is_hotel_admin_of(accommodation_id));

CREATE TRIGGER update_accommodation_notification_settings_updated_at
  BEFORE UPDATE ON public.accommodation_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.group_buy_campaign_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL UNIQUE REFERENCES public.group_buy_campaigns(id) ON DELETE CASCADE,
  notification_emails text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_buy_campaign_notification_settings TO authenticated;
GRANT ALL ON public.group_buy_campaign_notification_settings TO service_role;

ALTER TABLE public.group_buy_campaign_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view campaign notification settings"
  ON public.group_buy_campaign_notification_settings FOR SELECT TO authenticated
  USING (
    is_admin_or_super() OR EXISTS (
      SELECT 1 FROM public.group_buy_campaigns c
      WHERE c.id = campaign_id AND is_hotel_admin_of(c.accommodation_id)
    )
  );

CREATE POLICY "Managers can insert campaign notification settings"
  ON public.group_buy_campaign_notification_settings FOR INSERT TO authenticated
  WITH CHECK (
    is_admin_or_super() OR EXISTS (
      SELECT 1 FROM public.group_buy_campaigns c
      WHERE c.id = campaign_id AND is_hotel_admin_of(c.accommodation_id)
    )
  );

CREATE POLICY "Managers can update campaign notification settings"
  ON public.group_buy_campaign_notification_settings FOR UPDATE TO authenticated
  USING (
    is_admin_or_super() OR EXISTS (
      SELECT 1 FROM public.group_buy_campaigns c
      WHERE c.id = campaign_id AND is_hotel_admin_of(c.accommodation_id)
    )
  )
  WITH CHECK (
    is_admin_or_super() OR EXISTS (
      SELECT 1 FROM public.group_buy_campaigns c
      WHERE c.id = campaign_id AND is_hotel_admin_of(c.accommodation_id)
    )
  );

CREATE POLICY "Managers can delete campaign notification settings"
  ON public.group_buy_campaign_notification_settings FOR DELETE TO authenticated
  USING (
    is_admin_or_super() OR EXISTS (
      SELECT 1 FROM public.group_buy_campaigns c
      WHERE c.id = campaign_id AND is_hotel_admin_of(c.accommodation_id)
    )
  );

CREATE TRIGGER update_group_buy_campaign_notification_settings_updated_at
  BEFORE UPDATE ON public.group_buy_campaign_notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();