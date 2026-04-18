
-- 限制錯誤訊息與 context 大小，防止 abuse
ALTER TABLE public.frontend_error_reports
  ADD CONSTRAINT chk_error_message_length CHECK (LENGTH(error_message) <= 5000),
  ADD CONSTRAINT chk_url_length CHECK (url IS NULL OR LENGTH(url) <= 2000),
  ADD CONSTRAINT chk_user_agent_length CHECK (user_agent IS NULL OR LENGTH(user_agent) <= 1000),
  ADD CONSTRAINT chk_error_type_length CHECK (LENGTH(error_type) <= 100);
