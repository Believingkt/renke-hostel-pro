-- Fin（Intercom Custom Channel）× LINE 橋接
-- 只新增：ADD COLUMN / CREATE TABLE / CREATE INDEX / RLS / cron 排程（不 DROP、不 RENAME、不改型別）

ALTER TABLE public.line_oa_channels
  ADD COLUMN IF NOT EXISTS fin_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.fin_line_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_oa_channel_id uuid NULL REFERENCES public.line_oa_channels(id) ON DELETE CASCADE, -- NULL = 小安管家 OA
  line_user_id text NOT NULL,
  external_conversation_id uuid NOT NULL UNIQUE,
  intercom_conversation_id text NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'handoff', 'closed')),
  last_event_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_line_sessions_user_status_idx ON public.fin_line_sessions (line_user_id, status);

CREATE TABLE IF NOT EXISTS public.fin_line_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NULL REFERENCES public.fin_line_sessions(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  event_type text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  http_status int NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_line_events_created_at_idx ON public.fin_line_events (created_at);
CREATE INDEX IF NOT EXISTS fin_line_events_session_idx ON public.fin_line_events (session_id);

-- 僅 edge function（service_role）存取；含客人 LINE userId 與對話內容
ALTER TABLE public.fin_line_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_line_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fin_line_sessions FROM anon, authenticated;
REVOKE ALL ON public.fin_line_events FROM anon, authenticated;
GRANT ALL ON public.fin_line_sessions TO service_role;
GRANT ALL ON public.fin_line_events TO service_role;

-- 每日清除 30 天前的事件紀錄（寫法同 cron-history-cleanup-daily）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fin-line-events-cleanup-daily') THEN
    PERFORM cron.schedule('fin-line-events-cleanup-daily', '35 5 * * *', $cron$delete from public.fin_line_events where created_at < now() - interval '30 days'$cron$);
  END IF;
END $$;
