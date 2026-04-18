-- 建立統一錯誤日誌表（前端建單流程 + Edge Function）
CREATE TABLE public.error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('frontend', 'backend')),
  category TEXT NOT NULL,
  function_name TEXT,
  step TEXT,
  accommodation_id UUID REFERENCES public.accommodation_info(id) ON DELETE SET NULL,
  user_id UUID,
  idempotency_key TEXT,
  error_message TEXT NOT NULL,
  error_code TEXT,
  context JSONB,
  user_agent TEXT,
  url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_error_logs_created_at ON public.error_logs (created_at DESC);
CREATE INDEX idx_error_logs_source_category ON public.error_logs (source, category);
CREATE INDEX idx_error_logs_accommodation ON public.error_logs (accommodation_id, created_at DESC);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- 任何人（含未登入）皆可寫入錯誤日誌（建單失敗的訪客也要能回報）
CREATE POLICY "Anyone can insert error logs"
ON public.error_logs FOR INSERT
WITH CHECK (true);

-- 僅 super_admin 可讀
CREATE POLICY "Only super_admin can view error logs"
ON public.error_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'::public.app_role
  )
);

-- 自動清理 30 天前的紀錄（避免膨脹）
CREATE OR REPLACE FUNCTION public.cleanup_old_error_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.error_logs WHERE created_at < now() - INTERVAL '30 days';
END;
$$;