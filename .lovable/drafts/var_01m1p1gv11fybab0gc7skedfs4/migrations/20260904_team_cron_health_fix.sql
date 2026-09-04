-- 修正：最後執行時間被「進行中（start_time 為 null）」的紀錄蓋掉，導致顯示「從未執行」
CREATE OR REPLACE FUNCTION public.team_cron_health()
RETURNS TABLE (
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  last_start timestamptz,
  last_end timestamptz,
  last_status text,
  last_message text,
  runs_24h bigint,
  failures_24h bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM public.team_member_profiles t WHERE t.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'super_admin'::app_role
    )
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    j.jobid,
    j.jobname::text,
    j.schedule::text,
    j.active,
    l.start_time,
    l.end_time,
    l.status::text,
    left(coalesce(l.return_message, ''), 200) AS last_message,
    coalesce(s.runs_24h, 0),
    coalesce(s.failures_24h, 0)
  FROM cron.job j
  LEFT JOIN LATERAL (
    -- 只取「已完成」的紀錄作為最後執行結果，忽略仍在執行中的暫存列
    SELECT d.start_time, d.end_time, d.status, d.return_message
    FROM cron.job_run_details d
    WHERE d.jobid = j.jobid
      AND d.start_time IS NOT NULL
    ORDER BY d.start_time DESC
    LIMIT 1
  ) l ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*) AS runs_24h,
      count(*) FILTER (
        WHERE d.status IN ('failed', 'error')
      ) AS failures_24h
    FROM cron.job_run_details d
    WHERE d.jobid = j.jobid
      AND d.start_time IS NOT NULL
      AND d.start_time > now() - interval '24 hours'
  ) s ON true
  ORDER BY j.jobname;
END;
$$;

REVOKE ALL ON FUNCTION public.team_cron_health() FROM public;
GRANT EXECUTE ON FUNCTION public.team_cron_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_cron_health() TO service_role;
