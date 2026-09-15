
-- 1. Auto-reward points trigger function
CREATE OR REPLACE FUNCTION public.reward_member_points_on_checkout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member RECORD;
  v_rule RECORD;
  v_points INTEGER;
  v_current_balance INTEGER;
BEGIN
  -- Only trigger when status changes to checked_out
  IF NEW.order_status = 'checked_out' AND OLD.order_status IS DISTINCT FROM 'checked_out' THEN
    
    -- Find matching platform member by email or phone
    SELECT pm.id INTO v_member
    FROM platform_members pm
    WHERE (pm.email IS NOT NULL AND pm.email = NEW.guest_email)
       OR (pm.phone IS NOT NULL AND pm.phone = NEW.guest_phone)
    LIMIT 1;
    
    IF v_member.id IS NULL THEN
      RETURN NEW; -- No matching member, skip
    END IF;
    
    -- Check if points already awarded for this order
    IF EXISTS (
      SELECT 1 FROM member_point_transactions
      WHERE order_id = NEW.id AND type = 'earn_order'
    ) THEN
      RETURN NEW; -- Already awarded
    END IF;
    
    -- Get applicable point rule (accommodation-specific first, then platform-wide)
    SELECT * INTO v_rule
    FROM point_rules
    WHERE is_active = true
      AND (accommodation_id = NEW.accommodation_id OR accommodation_id IS NULL)
    ORDER BY 
      CASE WHEN accommodation_id IS NOT NULL THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT 1;
    
    IF v_rule.id IS NULL THEN
      RETURN NEW; -- No active rule
    END IF;
    
    -- Check minimum order amount
    IF NEW.final_price < v_rule.min_order_amount THEN
      RETURN NEW; -- Below minimum
    END IF;
    
    -- Calculate points: final_price * earn_rate * points_per_dollar
    v_points := GREATEST(1, FLOOR(NEW.final_price * v_rule.earn_rate * v_rule.points_per_dollar));
    
    -- Get current balance
    SELECT balance INTO v_current_balance
    FROM member_points
    WHERE member_id = v_member.id;
    
    IF v_current_balance IS NULL THEN
      v_current_balance := 0;
    END IF;
    
    -- Insert transaction
    INSERT INTO member_point_transactions (
      member_id, type, amount, balance_after, order_id, accommodation_id, description
    ) VALUES (
      v_member.id,
      'earn_order',
      v_points,
      v_current_balance + v_points,
      NEW.id,
      NEW.accommodation_id,
      '訂房消費回饋 - 訂單 ' || NEW.order_number
    );
    
    -- Update member points
    UPDATE member_points
    SET balance = balance + v_points,
        lifetime_earned = lifetime_earned + v_points
    WHERE member_id = v_member.id;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2. Create trigger on orders table
CREATE TRIGGER on_order_checkout_reward_points
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.reward_member_points_on_checkout();

-- 3. Allow authenticated members to insert their own coupon usages
CREATE POLICY "Members can insert own coupon usages" ON public.coupon_usages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.platform_members pm WHERE pm.id = member_id AND pm.user_id = auth.uid())
  );

-- 4. Allow authenticated members to insert their own point transactions (for redemption)
CREATE POLICY "Members can insert own transactions" ON public.member_point_transactions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.platform_members pm WHERE pm.id = member_id AND pm.user_id = auth.uid())
  );

-- 5. Add member_id column to orders for direct member linkage (nullable)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES public.platform_members(id) ON DELETE SET NULL;

-- 6. Function to validate and redeem platform coupon
CREATE OR REPLACE FUNCTION public.validate_platform_coupon(
  p_code text,
  p_member_id uuid,
  p_order_amount integer,
  p_accommodation_id uuid DEFAULT NULL
)
RETURNS TABLE(
  is_valid boolean,
  coupon_id uuid,
  coupon_type text,
  coupon_value integer,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_coupon RECORD;
  v_usage_count INTEGER;
BEGIN
  -- Find coupon
  SELECT * INTO v_coupon
  FROM platform_coupons pc
  WHERE pc.code = UPPER(p_code)
    AND pc.is_active = true
    AND pc.valid_from <= now()
    AND (pc.valid_until IS NULL OR pc.valid_until >= now());
  
  IF v_coupon.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::integer, '優惠券不存在或已失效'::text;
    RETURN;
  END IF;
  
  -- Check scope
  IF v_coupon.scope = 'accommodation' AND v_coupon.accommodation_id IS DISTINCT FROM p_accommodation_id THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::integer, '此優惠券不適用於此民宿'::text;
    RETURN;
  END IF;
  
  -- Check usage limit
  IF v_coupon.usage_limit > 0 AND v_coupon.used_count >= v_coupon.usage_limit THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::integer, '優惠券使用次數已達上限'::text;
    RETURN;
  END IF;
  
  -- Check per-member limit
  IF p_member_id IS NOT NULL AND v_coupon.per_member_limit > 0 THEN
    SELECT COUNT(*) INTO v_usage_count
    FROM coupon_usages cu
    WHERE cu.coupon_id = v_coupon.id AND cu.member_id = p_member_id;
    
    IF v_usage_count >= v_coupon.per_member_limit THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::integer, '您已達此優惠券的使用次數上限'::text;
      RETURN;
    END IF;
  END IF;
  
  -- Check minimum order amount
  IF v_coupon.min_order_amount > 0 AND p_order_amount < v_coupon.min_order_amount THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, NULL::integer, ('訂單金額未達最低消費 NT$ ' || v_coupon.min_order_amount::text)::text;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT 
    true, 
    v_coupon.id,
    v_coupon.coupon_type::text, 
    v_coupon.coupon_value, 
    '優惠券有效'::text;
END;
$$;
