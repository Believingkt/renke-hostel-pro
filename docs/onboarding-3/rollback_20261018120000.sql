-- 20261018120000 rollback（須先 rollback 120002、120001）。送審／退回中的 final_check 會改回 pending。
BEGIN;
DROP TRIGGER IF EXISTS trg_onboarding_steps_guard_review ON public.accommodation_onboarding_steps;
DROP FUNCTION IF EXISTS public.onboarding_steps_guard_review();
UPDATE public.accommodation_onboarding_steps SET status = 'pending' WHERE status IN ('submitted', 'returned');
ALTER TABLE public.accommodation_onboarding_steps
  DROP CONSTRAINT accommodation_onboarding_steps_status_check,
  ADD CONSTRAINT accommodation_onboarding_steps_status_check CHECK (status IN ('pending', 'confirmed', 'not_applicable')),
  DROP COLUMN submitted_at, DROP COLUMN submitted_by, DROP COLUMN returned_at, DROP COLUMN returned_by, DROP COLUMN return_reason;
ALTER TABLE public.accommodation_info DROP COLUMN first_activated_at;
COMMIT;
