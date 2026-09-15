-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL,
  order_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT fk_accommodation FOREIGN KEY (accommodation_id) REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  CONSTRAINT fk_order FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Only admins can view notifications"
ON public.notifications
FOR SELECT
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'staff'::app_role)
);

CREATE POLICY "Only admins can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Only admins can update notifications"
ON public.notifications
FOR UPDATE
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'staff'::app_role)
);

CREATE POLICY "Only admins can delete notifications"
ON public.notifications
FOR DELETE
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- Create index for performance
CREATE INDEX idx_notifications_accommodation_id ON public.notifications(accommodation_id);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read);