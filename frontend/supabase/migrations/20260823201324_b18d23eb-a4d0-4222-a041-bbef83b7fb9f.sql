ALTER TABLE public.group_buy_campaigns
  ADD COLUMN IF NOT EXISTS enable_atm boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_credit_card boolean NOT NULL DEFAULT false;

ALTER TABLE public.group_buy_payment_events
  DROP CONSTRAINT IF EXISTS group_buy_payment_events_event_type_check;

ALTER TABLE public.group_buy_payment_events
  ADD CONSTRAINT group_buy_payment_events_event_type_check CHECK (
    event_type = ANY (ARRAY[
      'order_created','guest_reported','admin_confirmed','expired','cancelled','note',
      'email_sent','email_failed','refunded','refund_failed',
      'cancel_requested','cancel_request_rejected',
      'atm_created','atm_paid'
    ])
  );