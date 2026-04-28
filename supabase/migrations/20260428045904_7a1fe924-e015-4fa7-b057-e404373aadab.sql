-- 1) 清理現有重複通知：每組 (order_id, type) 只保留最新一筆
DELETE FROM public.notifications a
USING public.notifications b
WHERE a.order_id IS NOT NULL
  AND a.order_id = b.order_id
  AND a.type = b.type
  AND a.created_at < b.created_at;

-- 2) 唯一索引防呆：同一筆訂單同一類型只能有一筆通知
CREATE UNIQUE INDEX IF NOT EXISTS notifications_order_type_uniq
  ON public.notifications (order_id, type)
  WHERE order_id IS NOT NULL;

-- 3) 伺服器端寫入：訂單 INSERT 時建立「新訂單通知」
CREATE OR REPLACE FUNCTION public.create_new_order_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.notifications (accommodation_id, title, description, type, order_id)
  VALUES (
    NEW.accommodation_id,
    '🎉 新訂單通知',
    '訂單編號：' || NEW.order_number ||
    E'\n客戶：' || COALESCE(NEW.guest_name, '') ||
    E'\n金額：$' || to_char(COALESCE(NEW.final_price, 0), 'FM999,999,999'),
    'new_order',
    NEW.id
  )
  ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_new_order_notification ON public.orders;
CREATE TRIGGER trg_create_new_order_notification
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.create_new_order_notification();

-- 4) 伺服器端寫入：訂單 UPDATE 時依狀態變化建立對應通知
CREATE OR REPLACE FUNCTION public.create_order_update_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status_map jsonb := jsonb_build_object(
    'pending', '待確認',
    'confirmed', '已確認',
    'cancelled', '已取消'
  );
  v_old_label text;
  v_new_label text;
BEGIN
  -- 訂單狀態變化（非取消→取消、待確認→已確認等）
  IF NEW.order_status IS DISTINCT FROM OLD.order_status THEN
    v_old_label := COALESCE(v_status_map->>OLD.order_status, OLD.order_status);
    v_new_label := COALESCE(v_status_map->>NEW.order_status, NEW.order_status);

    INSERT INTO public.notifications (accommodation_id, title, description, type, order_id)
    VALUES (
      NEW.accommodation_id,
      '📋 訂單狀態更新',
      '訂單編號：' || NEW.order_number ||
      E'\n狀態：' || v_old_label || ' → ' || v_new_label,
      'status_update',
      NEW.id
    )
    ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL DO UPDATE
      SET description = EXCLUDED.description,
          is_read = false,
          created_at = now();
  END IF;

  -- 付款完成
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     AND NEW.payment_status IN ('paid', 'fully_paid', 'deposit_paid') THEN
    INSERT INTO public.notifications (accommodation_id, title, description, type, order_id)
    VALUES (
      NEW.accommodation_id,
      '💰 付款完成',
      '訂單編號：' || NEW.order_number ||
      E'\n已收到款項：$' || to_char(COALESCE(NEW.paid_amount, 0), 'FM999,999,999'),
      'payment',
      NEW.id
    )
    ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL DO UPDATE
      SET description = EXCLUDED.description,
          is_read = false,
          created_at = now();
  END IF;

  -- 退款（全額或部分）
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     AND NEW.payment_status IN ('refunded', 'partial_refunded') THEN
    INSERT INTO public.notifications (accommodation_id, title, description, type, order_id)
    VALUES (
      NEW.accommodation_id,
      CASE WHEN NEW.payment_status = 'refunded' THEN '💸 訂單已退款' ELSE '💸 訂單部分退款' END,
      '訂單編號：' || NEW.order_number ||
      E'\n剩餘已付金額：$' || to_char(COALESCE(NEW.paid_amount, 0), 'FM999,999,999'),
      'refund',
      NEW.id
    )
    ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL DO UPDATE
      SET title = EXCLUDED.title,
          description = EXCLUDED.description,
          is_read = false,
          created_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_order_update_notification ON public.orders;
CREATE TRIGGER trg_create_order_update_notification
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.create_order_update_notification();

-- 5) 確保 notifications 啟用 realtime（讓前端訂閱新通知並彈 toast）
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END $$;