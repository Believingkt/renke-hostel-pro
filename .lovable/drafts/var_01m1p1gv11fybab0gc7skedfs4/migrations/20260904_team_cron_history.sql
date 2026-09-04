-- 業績通報「功能狀態查詢」：提供單一功能的歷史執行紀錄（唯讀）
CREATE OR REPLACE FUNCTION public.team_cron_history(_jobid bigint, _limit int DEFAULT 20)
RETURNS TABLE(
  start_time timestamptz,
  end_time timestamptz,
  status text,
  return_message text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $function$
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
  SELECT d.start_time, d.end_time, d.status::text, left(coalesce(d.return_message, ''), 200)
  FROM cron.job_run_details d
  WHERE d.jobid = _jobid
  ORDER BY d.start_time DESC
  LIMIT greatest(1, least(coalesce(_limit, 20), 100));
END;
$function$;

REVOKE ALL ON FUNCTION public.team_cron_history(bigint, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_cron_history(bigint, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_cron_history(bigint, int) TO service_role;
