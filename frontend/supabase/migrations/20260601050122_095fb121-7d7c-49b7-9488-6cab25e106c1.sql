-- ============================================================
-- 1. accommodation_owners: 民宿業主聯絡人
-- ============================================================
CREATE TABLE IF NOT EXISTS public.accommodation_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  owner_name text NOT NULL,
  email text NOT NULL,
  line_user_id text,
  notify_priority int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (accommodation_id, email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accommodation_owners TO authenticated;
GRANT ALL ON public.accommodation_owners TO service_role;

ALTER TABLE public.accommodation_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage accommodation owners"
  ON public.accommodation_owners
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

CREATE INDEX IF NOT EXISTS idx_accommodation_owners_acc
  ON public.accommodation_owners (accommodation_id, is_active, notify_priority);

CREATE TRIGGER update_accommodation_owners_updated_at
  BEFORE UPDATE ON public.accommodation_owners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. staging table: PII 補填狀態機
-- ============================================================
ALTER TABLE public.owlting_email_parsed_staging
  ADD COLUMN IF NOT EXISTS pii_status text NOT NULL DEFAULT 'pending_pii_fillup',
  ADD COLUMN IF NOT EXISTS pii_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS promoted_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_filled_at timestamptz,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;

-- Add check constraint for pii_status (drop first if exists to be idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'owlting_staging_pii_status_check'
  ) THEN
    ALTER TABLE public.owlting_email_parsed_staging
      ADD CONSTRAINT owlting_staging_pii_status_check
      CHECK (pii_status IN ('pending_pii_fillup','pii_filled','promoted_to_booking','expired','skipped'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_owlting_staging_pii_status
  ON public.owlting_email_parsed_staging (pii_status, pii_due_at);

-- Trigger: 自動計算 pii_due_at = MIN(received+24h, check_in-72h)
CREATE OR REPLACE FUNCTION public.set_owlting_staging_pii_due()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_received_due timestamptz;
  v_checkin_due timestamptz := NULL;
BEGIN
  v_received_due := COALESCE(NEW.created_at, now()) + interval '24 hours';
  IF NEW.check_in_date IS NOT NULL THEN
    v_checkin_due := (NEW.check_in_date::timestamptz - interval '3 days');
  END IF;
  IF NEW.pii_due_at IS NULL THEN
    NEW.pii_due_at := LEAST(v_received_due, COALESCE(v_checkin_due, v_received_due));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_owlting_staging_pii_due ON public.owlting_email_parsed_staging;
CREATE TRIGGER trg_owlting_staging_pii_due
  BEFORE INSERT ON public.owlting_email_parsed_staging
  FOR EACH ROW EXECUTE FUNCTION public.set_owlting_staging_pii_due();

-- Backfill pii_due_at for existing rows
UPDATE public.owlting_email_parsed_staging
SET pii_due_at = LEAST(
  created_at + interval '24 hours',
  COALESCE((check_in_date::timestamptz - interval '3 days'), created_at + interval '24 hours')
)
WHERE pii_due_at IS NULL;

-- ============================================================
-- 3. owlting_fillup_tokens: 免登入 magic link
-- ============================================================
CREATE TABLE IF NOT EXISTS public.owlting_fillup_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staging_id uuid NOT NULL REFERENCES public.owlting_email_parsed_staging(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  fail_count int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_attempt_ip text,
  ip_attempts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owlting_fillup_tokens TO authenticated;
GRANT ALL ON public.owlting_fillup_tokens TO service_role;

ALTER TABLE public.owlting_fillup_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage fillup tokens"
  ON public.owlting_fillup_tokens
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_super())
  WITH CHECK (public.is_admin_or_super());

CREATE INDEX IF NOT EXISTS idx_owlting_fillup_token_hash
  ON public.owlting_fillup_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_owlting_fillup_staging
  ON public.owlting_fillup_tokens (staging_id, created_at DESC);