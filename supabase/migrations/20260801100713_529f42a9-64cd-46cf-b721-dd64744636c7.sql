CREATE TABLE public.order_manual_review_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  accommodation_id uuid NOT NULL,
  task_type text NOT NULL DEFAULT 'guest_count_repricing',
  reason_code text NOT NULL DEFAULT 'guest_count_repricing',
  requested_guest_count integer,
  requested_check_in date,
  requested_check_out date,
  quote_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  requester_note text,
  status text NOT NULL DEFAULT 'pending',
  assignee_id uuid,
  resolution_note text,
  resolved_amount numeric,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_manual_review_tasks TO authenticated;
GRANT ALL ON public.order_manual_review_tasks TO service_role;

ALTER TABLE public.order_manual_review_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view review tasks"
ON public.order_manual_review_tasks FOR SELECT TO authenticated
USING (public.is_admin_or_super() OR public.is_hotel_admin_of(accommodation_id) OR public.staff_can_view_module(accommodation_id, 'orders'));

CREATE POLICY "Staff can update review tasks"
ON public.order_manual_review_tasks FOR UPDATE TO authenticated
USING (public.is_admin_or_super() OR public.is_hotel_admin_of(accommodation_id) OR public.staff_can_edit_module(accommodation_id, 'orders'))
WITH CHECK (public.is_admin_or_super() OR public.is_hotel_admin_of(accommodation_id) OR public.staff_can_edit_module(accommodation_id, 'orders'));

CREATE POLICY "Admins can insert review tasks"
ON public.order_manual_review_tasks FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_super() OR public.is_hotel_admin_of(accommodation_id) OR public.staff_can_edit_module(accommodation_id, 'orders'));

CREATE POLICY "Admins can delete review tasks"
ON public.order_manual_review_tasks FOR DELETE TO authenticated
USING (public.is_admin_or_super() OR public.is_hotel_admin_of(accommodation_id));

CREATE INDEX idx_omrt_status ON public.order_manual_review_tasks(accommodation_id, status, created_at DESC);
CREATE INDEX idx_omrt_order ON public.order_manual_review_tasks(order_id);
CREATE UNIQUE INDEX idx_omrt_open_per_order ON public.order_manual_review_tasks(order_id, task_type) WHERE status IN ('pending','in_progress');

CREATE TRIGGER trg_omrt_updated_at
BEFORE UPDATE ON public.order_manual_review_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();