-- 2026-09-19 遷移前置：原檔以寫死的 jobid 呼叫 cron.alter_job，在新專案（jobid 不同或不存在）會失敗。
-- 改為依 jobname 查 jobid、存在才調整；行為對舊專案完全相同。
DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT * FROM (VALUES
      ('send-daily-performance-every-minute', '*/5 * * * *'),
      ('owlting-order-push-every-minute',     '*/2 * * * *'),
      ('notify-order-status-change-every-min','*/2 * * * *'),
      ('cancel-expired-atm-orders-every-minute','*/5 * * * *'),
      ('push-checkin-reminders-daily',        '20 2 * * *'),
      ('daily-backup-cleanup',                '45 3 * * *'),
      ('cleanup-unverified-members-daily',    '15 4 * * *'),
      ('sync-meta-ads-weekly',                '40 1 * * 1')
    ) AS t(jobname, sched)
  LOOP
    PERFORM cron.alter_job(job_id => c.jobid, schedule => j.sched)
    FROM cron.job c WHERE c.jobname = j.jobname;
  END LOOP;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cron-history-cleanup-daily') THEN
    PERFORM cron.schedule('cron-history-cleanup-daily', '25 5 * * *', $cron$delete from cron.job_run_details where end_time < now() - interval '14 days'$cron$);
  END IF;
END $$;

delete from cron.job_run_details where end_time < now() - interval '14 days';
