-- 20261018120000 套用前唯讀檢查：每列都應為 true
SELECT 'first_activated_at 尚不存在' AS item, NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='accommodation_info' AND column_name='first_activated_at') AS ok
UNION ALL SELECT 'return_reason 尚不存在', NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='accommodation_onboarding_steps' AND column_name='return_reason')
UNION ALL SELECT 'status check 為原本 3 種', replace(pg_get_constraintdef(c.oid), E'\r', '') LIKE '%pending%confirmed%not_applicable%' AND replace(pg_get_constraintdef(c.oid), E'\r', '') NOT LIKE '%submitted%'
  FROM pg_constraint c WHERE c.conrelid='public.accommodation_onboarding_steps'::regclass AND c.conname='accommodation_onboarding_steps_status_check'
UNION ALL SELECT '現有 status 都在原本 3 種內', NOT EXISTS (SELECT 1 FROM public.accommodation_onboarding_steps WHERE status NOT IN ('pending','confirmed','not_applicable'))
UNION ALL SELECT 'guard trigger 尚不存在', NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_onboarding_steps_guard_review');
