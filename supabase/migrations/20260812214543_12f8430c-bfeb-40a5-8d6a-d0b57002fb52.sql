ALTER TABLE public.trip_generations
  ADD COLUMN IF NOT EXISTS translation_status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS translated_at timestamptz;

ALTER TABLE public.trip_generations
  DROP CONSTRAINT IF EXISTS trip_generations_translation_status_check;

ALTER TABLE public.trip_generations
  ADD CONSTRAINT trip_generations_translation_status_check
  CHECK (translation_status IN ('pending','ready','failed'));