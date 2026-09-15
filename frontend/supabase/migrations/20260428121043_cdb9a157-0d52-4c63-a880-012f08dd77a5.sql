UPDATE public.orders o
SET total_price = sub.sum_price,
    final_price = GREATEST(sub.sum_price - COALESCE(o.discount_amount, 0), 0) + COALESCE(o.meal_plan_total, 0) + COALESCE(o.pet_plan_price, 0)
FROM (
  SELECT order_id, SUM(room_price) AS sum_price
  FROM public.order_rooms
  GROUP BY order_id
) sub
WHERE o.id = sub.order_id
  AND o.total_price = 0
  AND sub.sum_price > 0
  AND o.payment_status NOT IN ('deposit_paid', 'fully_paid', 'paid')
  AND o.order_source IN ('manual', 'line', 'phone', 'official_use');