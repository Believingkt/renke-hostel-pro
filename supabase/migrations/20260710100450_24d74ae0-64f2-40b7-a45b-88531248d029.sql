
-- Enqueue an extra Cancel to verify OwlTing sync on delete, even though last_action was Cancel.
INSERT INTO public.owlting_order_push_queue (accommodation_id, order_id, res_status, echo_token, status, order_snapshot)
SELECT
  o.accommodation_id,
  o.id,
  'Cancel',
  'RENKE-' || o.order_number || '-' || extract(epoch from now())::bigint || '-delverify',
  'pending',
  jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'accommodation_id', o.accommodation_id,
    'check_in_date', o.check_in_date,
    'check_out_date', o.check_out_date,
    'guest_count', o.guest_count,
    'guest_name', o.guest_name,
    'guest_phone', o.guest_phone,
    'guest_email', o.guest_email,
    'total_price', o.total_price,
    'final_price', o.final_price,
    'deposit_amount', o.deposit_amount,
    'payment_status', o.payment_status,
    'notes', o.notes,
    'room_type_id', o.room_type_id,
    'package_id', o.package_id,
    'meal_plan', o.meal_plan,
    'owlting_unique_id', o.owlting_unique_id,
    'order_status', 'cancelled',
    'order_rooms', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('room_type_id', room_type_id, 'quantity', quantity, 'room_price', room_price))
      FROM public.order_rooms WHERE order_id = o.id
    ), '[]'::jsonb)
  )
FROM public.orders o
WHERE o.id = 'c6e8c46e-fbf1-4fe6-8b22-9f9440275693';

-- Now delete related data + order
DELETE FROM public.coupon_usages WHERE order_id = 'c6e8c46e-fbf1-4fe6-8b22-9f9440275693';
DELETE FROM public.addon_sales WHERE related_order_id = 'c6e8c46e-fbf1-4fe6-8b22-9f9440275693';
DELETE FROM public.split_records WHERE order_id = 'c6e8c46e-fbf1-4fe6-8b22-9f9440275693';
DELETE FROM public.commission_records WHERE order_id = 'c6e8c46e-fbf1-4fe6-8b22-9f9440275693';
DELETE FROM public.order_commissions WHERE order_id = 'c6e8c46e-fbf1-4fe6-8b22-9f9440275693';
DELETE FROM public.order_meta WHERE order_id = 'c6e8c46e-fbf1-4fe6-8b22-9f9440275693';
DELETE FROM public.order_rooms WHERE order_id = 'c6e8c46e-fbf1-4fe6-8b22-9f9440275693';
DELETE FROM public.deposit_charges WHERE order_id = 'c6e8c46e-fbf1-4fe6-8b22-9f9440275693';
DELETE FROM public.deposit_card_tokens WHERE order_id = 'c6e8c46e-fbf1-4fe6-8b22-9f9440275693';
DELETE FROM public.orders WHERE id = 'c6e8c46e-fbf1-4fe6-8b22-9f9440275693';
