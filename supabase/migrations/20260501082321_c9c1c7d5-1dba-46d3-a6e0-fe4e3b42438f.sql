CREATE OR REPLACE FUNCTION public.create_new_order_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  ON CONFLICT (order_id, type)
  WHERE (order_id IS NOT NULL AND type <> 'settled_amount_change')
  DO NOTHING;

  RETURN NEW;
END;
$function$;