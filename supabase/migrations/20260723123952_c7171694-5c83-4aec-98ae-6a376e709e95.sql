ALTER TABLE public.orders DISABLE TRIGGER USER;
DELETE FROM public.orders WHERE order_number IN ('HV9A58D5','GF8N78S8');
UPDATE public.orders SET order_number='HV9A58D5' WHERE order_number='QY5D55V9';
UPDATE public.orders SET order_number='GF8N78S8' WHERE order_number='AL2P84M6';
ALTER TABLE public.orders ENABLE TRIGGER USER;