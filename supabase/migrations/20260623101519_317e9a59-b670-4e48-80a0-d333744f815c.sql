UPDATE public.owlting_order_push_queue q
SET status = 'pending',
    next_retry_at = now(),
    last_error = NULL
FROM public.orders o
WHERE q.order_id = o.id
  AND o.order_number = 'DY7C72S2';