UPDATE public.owlting_email_orders_raw r
SET accommodation_id = sub.acc_id,
    accommodation_name = COALESCE(r.accommodation_name, sub.acc_name)
FROM (
  SELECT obe_number,
         (array_agg(accommodation_id ORDER BY received_at DESC) FILTER (WHERE accommodation_id IS NOT NULL))[1] AS acc_id,
         (array_agg(accommodation_name ORDER BY received_at DESC) FILTER (WHERE accommodation_id IS NOT NULL))[1] AS acc_name
  FROM public.owlting_email_orders_raw
  WHERE obe_number IS NOT NULL
  GROUP BY obe_number
) sub
WHERE r.obe_number = sub.obe_number
  AND r.accommodation_id IS NULL
  AND sub.acc_id IS NOT NULL
  AND r.message_type IN ('cancelled','modified');