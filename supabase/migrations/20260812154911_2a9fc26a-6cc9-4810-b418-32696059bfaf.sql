CREATE TABLE public.kol_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_kol_id uuid NOT NULL REFERENCES public.kol_profiles(id) ON DELETE CASCADE,
  invitee_kol_id uuid REFERENCES public.kol_profiles(id) ON DELETE SET NULL,
  invite_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  override_rate numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  invitee_name text,
  invitee_ig text,
  invitee_contact text,
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kol_referrals TO authenticated;
GRANT ALL ON public.kol_referrals TO service_role;

ALTER TABLE public.kol_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal staff can view kol referrals"
ON public.kol_referrals FOR SELECT TO authenticated
USING (public.is_admin_or_super() OR public.is_sales_role(auth.uid()));

CREATE POLICY "Internal staff can insert kol referrals"
ON public.kol_referrals FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_super() OR public.is_sales_role(auth.uid()));

CREATE POLICY "Admins can update kol referrals"
ON public.kol_referrals FOR UPDATE TO authenticated
USING (public.is_admin_or_super())
WITH CHECK (public.is_admin_or_super());

CREATE POLICY "Admins can delete kol referrals"
ON public.kol_referrals FOR DELETE TO authenticated
USING (public.is_admin_or_super());

CREATE INDEX idx_kol_referrals_inviter ON public.kol_referrals(inviter_kol_id);
CREATE INDEX idx_kol_referrals_invitee ON public.kol_referrals(invitee_kol_id);

CREATE TRIGGER update_kol_referrals_updated_at
BEFORE UPDATE ON public.kol_referrals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();