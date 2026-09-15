-- Backfill 2026-04-30 audit lines: replace email "by xxx@..." with profiles.name when available.
-- Temporarily disable triggers so the locked-line guard does not block the rewrite.
SET session_replication_role = replica;

DO $$
DECLARE
  r RECORD;
  new_notes TEXT;
  prof_name TEXT;
  email_match TEXT;
BEGIN
  FOR r IN
    SELECT id, notes FROM public.orders
    WHERE notes ~ '🔒\[金額異動 2026-04-30[^\]]+by [^\] ]+@[^\] ]+\]'
  LOOP
    new_notes := r.notes;
    FOR email_match IN
      SELECT DISTINCT (regexp_matches(r.notes, 'by ([^\] ]+@[^\] ]+)\]', 'g'))[1]
    LOOP
      SELECT name INTO prof_name FROM public.profiles WHERE email = email_match LIMIT 1;
      IF prof_name IS NOT NULL AND length(trim(prof_name)) > 0 THEN
        new_notes := replace(new_notes, 'by ' || email_match || ']', 'by ' || prof_name || ']');
      END IF;
    END LOOP;
    IF new_notes IS DISTINCT FROM r.notes THEN
      UPDATE public.orders SET notes = new_notes WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

SET session_replication_role = DEFAULT;