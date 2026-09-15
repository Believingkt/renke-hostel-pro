-- 1) idempotency key 唯一約束（線上付款流程）
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_uniq
  ON public.orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2) 短時間重複送出的唯一約束（15 秒時間桶）
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_dedupe_key_uniq
  ON public.orders (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.orders_prevent_double_submit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sig text;
  v_exists uuid;
BEGIN
  v_sig := concat_ws('|',
    NEW.accommodation_id::text,
    coalesce(NEW.room_type_id::text, '-'),
    coalesce(NEW.package_id::text, '-'),
    NEW.check_in_date::text,
    NEW.check_out_date::text,
    coalesce(NEW.guest_phone, '-'),
    coalesce(NEW.guest_name, '-'),
    coalesce(NEW.room_quantity, 1)::text,
    coalesce(NEW.final_price, 0)::text
  );

  -- 交易鎖：讓同一組簽章的併發交易序列化
  PERFORM pg_advisory_xact_lock(hashtextextended(v_sig, 0));

  SELECT id INTO v_exists
  FROM public.orders
  WHERE dedupe_key IS NOT NULL
    AND dedupe_key LIKE v_sig || '@%'
    AND created_at > now() - interval '10 seconds'
  LIMIT 1;

  IF v_exists IS NOT NULL THEN
    RAISE EXCEPTION '偵測到重複送出的訂單，請重新整理後確認訂單是否已建立（重複訂單保護）'
      USING ERRCODE = '23505';
  END IF;

  NEW.dedupe_key := v_sig || '@' || floor(extract(epoch FROM now()) / 15)::text;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_prevent_double_submit ON public.orders;
CREATE TRIGGER trg_orders_prevent_double_submit
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_prevent_double_submit();

-- 3) order_rooms 明細防重複（同一張訂單、不同交易於 10 秒內寫入相同明細）
CREATE OR REPLACE FUNCTION public.order_rooms_prevent_double_submit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.order_id::text, 1));

  SELECT id INTO v_exists
  FROM public.order_rooms
  WHERE order_id = NEW.order_id
    AND room_type_id IS NOT DISTINCT FROM NEW.room_type_id
    AND room_unit_id IS NOT DISTINCT FROM NEW.room_unit_id
    AND quantity IS NOT DISTINCT FROM NEW.quantity
    AND room_price IS NOT DISTINCT FROM NEW.room_price
    -- 同一交易內的批次寫入 created_at 相同，僅擋下較晚的重複交易
    AND created_at < now()
    AND created_at > now() - interval '10 seconds'
  LIMIT 1;

  IF v_exists IS NOT NULL THEN
    RAISE EXCEPTION '偵測到重複送出的訂單房間明細，請重新整理後確認（重複寫入保護）'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_rooms_prevent_double_submit ON public.order_rooms;
CREATE TRIGGER trg_order_rooms_prevent_double_submit
  BEFORE INSERT ON public.order_rooms
  FOR EACH ROW EXECUTE FUNCTION public.order_rooms_prevent_double_submit();