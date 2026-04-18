
-- 1. 監控收件人（管理員告警 Email）
CREATE TABLE public.alert_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notify_health_check BOOLEAN NOT NULL DEFAULT true,
  notify_frontend_error BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.alert_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage alert recipients"
ON public.alert_recipients
FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- 2. 健檢日誌
CREATE TABLE public.system_health_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_url TEXT NOT NULL,
  target_label TEXT,
  status_code INTEGER,
  response_time_ms INTEGER,
  is_healthy BOOLEAN NOT NULL,
  error_message TEXT,
  alert_sent BOOLEAN NOT NULL DEFAULT false,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_health_logs_checked_at ON public.system_health_logs (checked_at DESC);
CREATE INDEX idx_system_health_logs_unhealthy ON public.system_health_logs (checked_at DESC) WHERE is_healthy = false;

ALTER TABLE public.system_health_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view health logs"
ON public.system_health_logs
FOR SELECT
USING (public.is_super_admin(auth.uid()));

-- 3. 前端錯誤回報
CREATE TABLE public.frontend_error_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  url TEXT,
  user_agent TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  context JSONB,
  alert_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_frontend_error_reports_created_at ON public.frontend_error_reports (created_at DESC);

ALTER TABLE public.frontend_error_reports ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can insert error reports
CREATE POLICY "Anyone can report frontend errors"
ON public.frontend_error_reports
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Super admins can view error reports"
ON public.frontend_error_reports
FOR SELECT
USING (public.is_super_admin(auth.uid()));

-- 4. 告警節流（避免短時間內重複寄送）
CREATE TABLE public.alert_throttle (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_key TEXT NOT NULL UNIQUE,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alert_throttle_key ON public.alert_throttle (alert_key);

ALTER TABLE public.alert_throttle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view throttle"
ON public.alert_throttle
FOR SELECT
USING (public.is_super_admin(auth.uid()));

-- 5. 自動清理 90 天以上的健檢日誌
CREATE OR REPLACE FUNCTION public.cleanup_old_monitoring_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.system_health_logs WHERE checked_at < now() - INTERVAL '90 days';
  DELETE FROM public.frontend_error_reports WHERE created_at < now() - INTERVAL '90 days';
  DELETE FROM public.alert_throttle WHERE last_sent_at < now() - INTERVAL '7 days';
END;
$$;
