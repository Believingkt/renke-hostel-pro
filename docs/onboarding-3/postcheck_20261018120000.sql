-- 20261018120000 套用後唯讀檢查：每列都應為 true
SELECT 'first_activated_at 已新增' AS item, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='accommodation_info' AND column_name='first_activated_at') AS ok
UNION ALL SELECT '除測試館外沒有 NULL', NOT EXISTS (SELECT 1 FROM public.accommodation_info WHERE id <> 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND first_activated_at IS NULL)
UNION ALL SELECT '5 個新欄位', (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='accommodation_onboarding_steps' AND column_name IN ('submitted_at','submitted_by','returned_at','returned_by','return_reason')) = 5
UNION ALL SELECT 'status check 含 submitted/returned', replace(pg_get_constraintdef(c.oid), E'\r', '') LIKE '%submitted%returned%'
  FROM pg_constraint c WHERE c.conrelid='public.accommodation_onboarding_steps'::regclass AND c.conname='accommodation_onboarding_steps_status_check'
UNION ALL SELECT 'guard trigger 存在', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_onboarding_steps_guard_review' AND tgrelid='public.accommodation_onboarding_steps'::regclass)
UNION ALL SELECT 'guard 函式內容', position('lakeze.wizard_write' IN replace(pg_get_functiondef('public.onboarding_steps_guard_review()'::regprocedure), E'\r', '')) > 0;
