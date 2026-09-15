ALTER TABLE public.group_buy_commissions
  ADD COLUMN IF NOT EXISTS manual_eligibility text,
  ADD COLUMN IF NOT EXISTS manual_note text,
  ADD COLUMN IF NOT EXISTS manual_set_by uuid,
  ADD COLUMN IF NOT EXISTS manual_set_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.group_buy_commissions'::regclass
      AND conname = 'group_buy_commissions_manual_eligibility_check'
  ) THEN
    ALTER TABLE public.group_buy_commissions
      ADD CONSTRAINT group_buy_commissions_manual_eligibility_check
      CHECK (manual_eligibility IS NULL OR manual_eligibility IN ('include','exclude'));
  END IF;
END $$;

COMMENT ON COLUMN public.group_buy_commissions.manual_eligibility IS 'NULL=自動判定；include=人工強制列入分潤；exclude=人工強制排除分潤';