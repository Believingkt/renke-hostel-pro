CREATE TABLE public.payment_link_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  accommodation_id uuid,
  order_number text NOT NULL,
  amount integer NOT NULL,
  method text NOT NULL DEFAULT 'card',
  acc_param text,
  link_url text NOT NULL,
  action text NOT NULL DEFAULT 'copy',
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_email text,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_link_logs_order ON public.payment_link_logs(order_id, created_at DESC);

GRANT SELECT, INSERT ON public.payment_link_logs TO authenticated;
GRANT ALL ON public.payment_link_logs TO service_role;

ALTER TABLE public.payment_link_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view payment link logs of their accommodations"
ON public.payment_link_logs FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR accommodation_id IS NULL
  OR accommodation_id IN (SELECT g.accommodation_id FROM public.get_user_accommodations(auth.uid()) g)
);

CREATE POLICY "Staff can insert payment link logs of their accommodations"
ON public.payment_link_logs FOR INSERT TO authenticated
WITH CHECK (
  performed_by = auth.uid()
  AND (
    public.is_super_admin(auth.uid())
    OR accommodation_id IS NULL
    OR accommodation_id IN (SELECT g.accommodation_id FROM public.get_user_accommodations(auth.uid()) g)
  )
);