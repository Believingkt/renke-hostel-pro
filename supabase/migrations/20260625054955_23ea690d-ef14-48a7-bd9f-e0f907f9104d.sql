ALTER TABLE public.closer_commission_snapshots
  ADD COLUMN check_out_date date,
  ADD COLUMN payout_month text;

-- Replace existing non-unique order_id index with a UNIQUE constraint
DROP INDEX IF EXISTS public.idx_closer_commission_snapshots_order_id;
ALTER TABLE public.closer_commission_snapshots
  ADD CONSTRAINT closer_commission_snapshots_order_id_key UNIQUE (order_id);

CREATE INDEX IF NOT EXISTS idx_closer_commission_snapshots_payout_month
  ON public.closer_commission_snapshots(payout_month);