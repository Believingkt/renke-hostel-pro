-- Add timestamp columns for order status tracking
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS confirmed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS checked_in_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS checked_out_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_orders_status_dates ON public.orders(order_status, confirmed_at, checked_in_at, checked_out_at);

-- Add comment for documentation
COMMENT ON COLUMN public.orders.confirmed_at IS '訂單確認時間';
COMMENT ON COLUMN public.orders.checked_in_at IS '入住時間';
COMMENT ON COLUMN public.orders.checked_out_at IS '退房時間';
COMMENT ON COLUMN public.orders.cancelled_at IS '取消時間';