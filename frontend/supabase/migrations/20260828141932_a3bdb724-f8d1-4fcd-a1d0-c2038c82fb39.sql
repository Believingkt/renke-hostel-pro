ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS booking_deposit_amount integer,
  ADD COLUMN IF NOT EXISTS booking_deposit_percentage numeric;

COMMENT ON COLUMN public.orders.booking_deposit_amount IS '訂房訂金金額（下單當下快照，SoT，不隨 booking_settings 變動）';
COMMENT ON COLUMN public.orders.booking_deposit_percentage IS '訂房訂金比例（%，下單當下快照）';

ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS email_show_security_deposit_notice boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_security_deposit_notice_title text,
  ADD COLUMN IF NOT EXISTS email_security_deposit_notice text;