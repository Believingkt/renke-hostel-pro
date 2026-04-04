
-- 1. Create enum for member point transaction types
CREATE TYPE public.member_point_type AS ENUM ('earn_order', 'earn_event', 'redeem', 'expire', 'admin_adjust');

-- 2. Create enum for coupon types
CREATE TYPE public.coupon_type AS ENUM ('percentage', 'fixed');

-- 3. Create enum for coupon scope
CREATE TYPE public.coupon_scope AS ENUM ('platform', 'accommodation');

-- 4. platform_members table
CREATE TABLE public.platform_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  phone text,
  email text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.platform_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read own data" ON public.platform_members
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Members can update own data" ON public.platform_members
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Members can insert own data" ON public.platform_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Super admins can read all members" ON public.platform_members
  FOR SELECT USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update all members" ON public.platform_members
  FOR UPDATE USING (public.is_super_admin(auth.uid()));

-- 5. member_points table
CREATE TABLE public.member_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.platform_members(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  lifetime_earned integer NOT NULL DEFAULT 0,
  lifetime_used integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_id)
);

ALTER TABLE public.member_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read own points" ON public.member_points
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.platform_members pm WHERE pm.id = member_id AND pm.user_id = auth.uid())
  );

CREATE POLICY "Super admins can manage points" ON public.member_points
  FOR ALL USING (public.is_super_admin(auth.uid()));

-- 6. member_point_transactions table (renamed to avoid conflict with existing point_transactions)
CREATE TABLE public.member_point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.platform_members(id) ON DELETE CASCADE,
  type member_point_type NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE SET NULL,
  description text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.member_point_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read own transactions" ON public.member_point_transactions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.platform_members pm WHERE pm.id = member_id AND pm.user_id = auth.uid())
  );

CREATE POLICY "Super admins can manage transactions" ON public.member_point_transactions
  FOR ALL USING (public.is_super_admin(auth.uid()));

-- 7. point_rules table
CREATE TABLE public.point_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  earn_rate numeric NOT NULL DEFAULT 0.05,
  min_order_amount integer NOT NULL DEFAULT 0,
  points_per_dollar numeric NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.point_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active rules" ON public.point_rules
  FOR SELECT USING (is_active = true);

CREATE POLICY "Super admins can manage rules" ON public.point_rules
  FOR ALL USING (public.is_super_admin(auth.uid()));

-- 8. platform_coupons table
CREATE TABLE public.platform_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  coupon_type coupon_type NOT NULL DEFAULT 'fixed',
  coupon_value integer NOT NULL DEFAULT 0,
  scope coupon_scope NOT NULL DEFAULT 'platform',
  accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  min_order_amount integer NOT NULL DEFAULT 0,
  usage_limit integer NOT NULL DEFAULT 0,
  per_member_limit integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active coupons" ON public.platform_coupons
  FOR SELECT USING (is_active = true);

CREATE POLICY "Super admins can manage coupons" ON public.platform_coupons
  FOR ALL USING (public.is_super_admin(auth.uid()));

-- 9. coupon_usages table
CREATE TABLE public.coupon_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.platform_coupons(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.platform_members(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  used_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read own usages" ON public.coupon_usages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.platform_members pm WHERE pm.id = member_id AND pm.user_id = auth.uid())
  );

CREATE POLICY "Super admins can manage usages" ON public.coupon_usages
  FOR ALL USING (public.is_super_admin(auth.uid()));

-- 10. Trigger: auto-create member_points when platform_member is created
CREATE OR REPLACE FUNCTION public.create_member_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.member_points (member_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_platform_member_created
  AFTER INSERT ON public.platform_members
  FOR EACH ROW
  EXECUTE FUNCTION public.create_member_points();

-- 11. updated_at triggers
CREATE TRIGGER update_platform_members_updated_at
  BEFORE UPDATE ON public.platform_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_member_points_updated_at
  BEFORE UPDATE ON public.member_points
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_point_rules_updated_at
  BEFORE UPDATE ON public.point_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_platform_coupons_updated_at
  BEFORE UPDATE ON public.platform_coupons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
