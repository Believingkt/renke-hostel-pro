-- 2a-3 補件：正式庫唯讀查核（只有 SELECT，不改任何資料）
-- 第 1 段：資料庫函式／trigger 內是否有呼叫 send-cancellation-email、send-invite-email（預期 0 列）
SELECT n.nspname AS schema_name, p.proname AS function_name
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosrc ILIKE '%send-cancellation-email%' OR p.prosrc ILIKE '%send-invite-email%'
   OR p.prosrc ILIKE '%send_cancellation_email%' OR p.prosrc ILIKE '%send_invite_email%';

-- 第 2 段：pg_cron 排程是否有呼叫（預期 0 列；若 cron schema 不存在會報錯，屬正常，可略過）
SELECT jobid, jobname, schedule
FROM cron.job
WHERE command ILIKE '%send-cancellation-email%' OR command ILIKE '%send-invite-email%';

-- 第 3 段：月結設定頁會用到的資料表 policy（預期與報告列出的名稱一致；Staff can view system settings 應不存在）
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('owner_settlement_pricing_rules', 'system_settings', 'accommodation_order_sources', 'orders', 'profiles', 'accommodation_info')
ORDER BY tablename, cmd, policyname;
