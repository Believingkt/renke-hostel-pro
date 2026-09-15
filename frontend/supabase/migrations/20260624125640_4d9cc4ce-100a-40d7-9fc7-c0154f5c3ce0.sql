ALTER TABLE public.orders DISABLE TRIGGER trg_orders_owlting_enqueue;
UPDATE public.orders
SET order_status = 'confirmed',
    check_out_date = '2026-07-09',
    cancelled_at = NULL
WHERE order_number = 'DY7C72S2';
ALTER TABLE public.orders ENABLE TRIGGER trg_orders_owlting_enqueue;