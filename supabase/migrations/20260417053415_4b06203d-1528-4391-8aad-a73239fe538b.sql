
-- Table to track coupons distributed/issued to specific members
CREATE TABLE public.member_coupon_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.platform_coupons(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.platform_members(id) ON DELETE CASCADE,
  distributed_by uuid,
  distribution_note text,
  is_used boolean NOT NULL DEFAULT false,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, member_id)
);

CREATE INDEX idx_member_coupon_distributions_member ON public.member_coupon_distributions(member_id);
CREATE INDEX idx_member_coupon_distributions_coupon ON public.member_coupon_distributions(coupon_id);

ALTER TABLE public.member_coupon_distributions ENABLE ROW LEVEL SECURITY;

-- Members can view their own distributed coupons
CREATE POLICY "Members can view own distributed coupons"
ON public.member_coupon_distributions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.platform_members pm
    WHERE pm.id = member_coupon_distributions.member_id
      AND pm.user_id = auth.uid()
  )
);

-- Super admins can manage all distributions
CREATE POLICY "Super admins can manage distributions"
ON public.member_coupon_distributions FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));
