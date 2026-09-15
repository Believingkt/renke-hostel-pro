CREATE TABLE public.referral_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  reward_tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.referral_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.referral_campaigns(id) ON DELETE CASCADE,
  inviter_id uuid REFERENCES public.platform_members(id) ON DELETE SET NULL,
  invite_code text NOT NULL UNIQUE,
  invitee_id uuid REFERENCES public.platform_members(id) ON DELETE SET NULL,
  invitee_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  tier int NOT NULL DEFAULT 1,
  reward_type text,
  reward_value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  parent_record_id uuid REFERENCES public.referral_records(id) ON DELETE SET NULL,
  click_count int NOT NULL DEFAULT 0,
  rewarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_referral_records_campaign ON public.referral_records(campaign_id);
CREATE INDEX idx_referral_records_inviter ON public.referral_records(inviter_id);
CREATE INDEX idx_referral_records_invitee ON public.referral_records(invitee_id);
CREATE INDEX idx_referral_records_parent ON public.referral_records(parent_record_id);

GRANT SELECT ON public.referral_campaigns TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_campaigns TO authenticated;
GRANT ALL ON public.referral_campaigns TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.referral_records TO authenticated;
GRANT ALL ON public.referral_records TO service_role;

ALTER TABLE public.referral_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active campaigns"
ON public.referral_campaigns FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins manage campaigns"
ON public.referral_campaigns FOR ALL
TO authenticated
USING (public.is_admin_or_super() OR (accommodation_id IS NOT NULL AND public.is_hotel_admin_of(accommodation_id)))
WITH CHECK (public.is_admin_or_super() OR (accommodation_id IS NOT NULL AND public.is_hotel_admin_of(accommodation_id)));

CREATE POLICY "Admins manage referral records"
ON public.referral_records FOR ALL
TO authenticated
USING (public.is_admin_or_super())
WITH CHECK (public.is_admin_or_super());

CREATE POLICY "Members read own referral records"
ON public.referral_records FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.platform_members pm
          WHERE pm.user_id = auth.uid()
            AND (pm.id = referral_records.inviter_id OR pm.id = referral_records.invitee_id))
);

CREATE POLICY "Members create own referral records"
ON public.referral_records FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.platform_members pm
          WHERE pm.user_id = auth.uid() AND pm.id = referral_records.inviter_id)
);

CREATE TRIGGER update_referral_campaigns_updated_at
BEFORE UPDATE ON public.referral_campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_referral_records_updated_at
BEFORE UPDATE ON public.referral_records
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();