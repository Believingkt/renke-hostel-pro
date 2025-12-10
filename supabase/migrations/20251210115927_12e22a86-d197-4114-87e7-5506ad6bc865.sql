-- Add separate payment method columns for deposit and balance payments
ALTER TABLE public.orders 
ADD COLUMN deposit_payment_method text,
ADD COLUMN balance_payment_method text;