-- ============================================================
-- Phase G2: 團購信用卡 payment draft（付款成功後才建正式 order）
-- ============================================================

CREATE TABLE public.group_buy_payment_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.group_buy_campaigns(id) ON DELETE CASCADE,
  campaign_package_id uuid NOT NULL REFERENCES public.group_buy_campaign_packages(id) ON DELETE CASCADE,
  accommodation_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  check_in_date date NOT NULL,
  check_out_date date NOT NULL,
  room_quantity integer NOT NULL DEFAULT 1,
  adult_count integer NOT NULL DEFAULT 2,
  child_count integer NOT NULL DEFAULT 0,
  toddler_count integer NOT NULL DEFAULT 0,
  infant_count integer NOT NULL DEFAULT 0,
  guest_count integer NOT NULL DEFAULT 2,
  guest_name text NOT NULL,
  guest_phone text NOT NULL,
  guest_email text NOT NULL,
  guest_note text,
  booking_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_price integer NOT NULL,
  deposit_amount integer NOT NULL,
  amount_to_charge integer NOT NULL,
  payment_provider text NOT NULL DEFAULT 'tappay',
  payment_type text NOT NULL DEFAULT 'credit_card',
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamp with time zone NOT NULL,
  rec_trade_id text,
  payment_attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_error text,
  converted_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  converted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT group_buy_payment_drafts_status_check CHECK (
    status IN ('pending','payment_processing','paid','converted','expired','failed','cancelled','manual_review')
  ),
  CONSTRAINT group_buy_payment_drafts_amount_check CHECK (amount_to_charge > 0 AND deposit_amount > 0 AND total_price > 0),
  CONSTRAINT group_buy_payment_drafts_dates_check CHECK (check_out_date > check_in_date)
);

-- 冪等：同一個 idempotency_key 只會有一張 draft
CREATE UNIQUE INDEX group_buy_payment_drafts_idem_key
  ON public.group_buy_payment_drafts (idempotency_key);

-- 一筆 TapPay 交易只能綁一張 draft
CREATE UNIQUE INDEX group_buy_payment_drafts_rec_trade_id_key
  ON public.group_buy_payment_drafts (rec_trade_id)
  WHERE rec_trade_id IS NOT NULL;

-- 一張 draft 最多只能轉出一張正式 order（反向唯一）
CREATE UNIQUE INDEX group_buy_payment_drafts_converted_order_key
  ON public.group_buy_payment_drafts (converted_order_id)
  WHERE converted_order_id IS NOT NULL;

-- hold 查詢用
CREATE INDEX group_buy_payment_drafts_hold_idx
  ON public.group_buy_payment_drafts (accommodation_id, room_type_id, check_in_date, check_out_date)
  WHERE converted_order_id IS NULL AND status IN ('pending','payment_processing','paid');

CREATE INDEX group_buy_payment_drafts_campaign_idx
  ON public.group_buy_payment_drafts (campaign_id, created_at DESC);

GRANT ALL ON public.group_buy_payment_drafts TO service_role;

ALTER TABLE public.group_buy_payment_drafts ENABLE ROW LEVEL SECURITY;

-- 只有後端（service_role，繞過 RLS）可寫；管理者可讀以便人工處理
CREATE POLICY "Admins can view group buy payment drafts"
ON public.group_buy_payment_drafts
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(accommodation_id));

GRANT SELECT ON public.group_buy_payment_drafts TO authenticated;

CREATE TRIGGER update_group_buy_payment_drafts_updated_at
BEFORE UPDATE ON public.group_buy_payment_drafts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 團購專用庫存查詢：原本可售房數 - 有效付款保留
-- 一般訂房仍使用 get_adjusted_room_inventory_batch，行為完全不變。
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_group_buy_adjusted_inventory_batch(
  p_room_type_id uuid,
  p_dates text[],
  p_accommodation_id uuid,
  p_exclude_draft_id uuid DEFAULT NULL
)
RETURNS TABLE(date_value date, available_rooms integer, is_blocked boolean, blocked_by_room_name text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_room_type record;
BEGIN
  SELECT * INTO v_room_type FROM room_types WHERE id = p_room_type_id;

  RETURN QUERY
  WITH base AS (
    SELECT * FROM public.get_adjusted_room_inventory_batch(p_room_type_id, p_dates, p_accommodation_id)
  ),
  -- 有效保留：尚未轉單，且（付款中且未過期）或（已付款待建單）
  live_holds AS (
    SELECT d.*
    FROM public.group_buy_payment_drafts d
    WHERE d.accommodation_id = p_accommodation_id
      AND d.converted_order_id IS NULL
      AND (p_exclude_draft_id IS NULL OR d.id <> p_exclude_draft_id)
      AND (
        (d.status IN ('pending','payment_processing') AND d.expires_at > now())
        OR d.status = 'paid'
      )
  ),
  -- 同房型保留 → 直接扣可售數
  same_type AS (
    SELECT b.date_value AS d, COALESCE(SUM(h.room_quantity), 0)::int AS held
    FROM base b
    LEFT JOIN live_holds h
      ON h.room_type_id = p_room_type_id
     AND b.date_value >= h.check_in_date
     AND b.date_value < h.check_out_date
    GROUP BY b.date_value
  ),
  -- 包棟互斥：其他「綁定包棟」房型被保留時，本房型整天不可售
  cross_block AS (
    SELECT b.date_value AS d, min(rt.name) AS name
    FROM base b
    JOIN live_holds h
      ON b.date_value >= h.check_in_date AND b.date_value < h.check_out_date
    JOIN room_types rt ON rt.id = h.room_type_id
    WHERE h.room_type_id <> p_room_type_id
      AND COALESCE(v_room_type.is_bound_to_exclusive, false) = true
      AND COALESCE(rt.is_bound_to_exclusive, false) = true
    GROUP BY b.date_value
  )
  SELECT
    b.date_value,
    CASE
      WHEN b.is_blocked THEN 0
      WHEN cb.name IS NOT NULL THEN 0
      ELSE GREATEST(b.available_rooms - COALESCE(st.held, 0), 0)
    END AS available_rooms,
    (b.is_blocked OR cb.name IS NOT NULL) AS is_blocked,
    COALESCE(b.blocked_by_room_name, CASE WHEN cb.name IS NOT NULL THEN cb.name || '（付款保留中）' END) AS blocked_by_room_name
  FROM base b
  LEFT JOIN same_type st ON st.d = b.date_value
  LEFT JOIN cross_block cb ON cb.d = b.date_value
  ORDER BY b.date_value;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_group_buy_adjusted_inventory_batch(uuid, text[], uuid, uuid) TO anon, authenticated, service_role;