DROP POLICY IF EXISTS "kvml_select_authenticated" ON public.kol_venue_monthly_limits;
CREATE POLICY "kvml_select_team" ON public.kol_venue_monthly_limits
  FOR SELECT TO authenticated
  USING (public.user_has_any_team_role(auth.uid()));

-- Column-level privileges: accommodation staff may only touch rating/note columns
REVOKE UPDATE ON public.ai_conversation_logs FROM authenticated;
GRANT UPDATE (user_rating, admin_note) ON public.ai_conversation_logs TO authenticated;
GRANT ALL ON public.ai_conversation_logs TO service_role;

CREATE OR REPLACE FUNCTION public.zz_ai_conversation_logs_protect_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.messages IS DISTINCT FROM OLD.messages
     OR NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.accommodation_id IS DISTINCT FROM OLD.accommodation_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.prompt_version IS DISTINCT FROM OLD.prompt_version
     OR NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'AI 對話紀錄內容不可修改，只能更新評分與管理備註';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_ai_conversation_logs_protect_content ON public.ai_conversation_logs;
CREATE TRIGGER zz_ai_conversation_logs_protect_content
  BEFORE UPDATE ON public.ai_conversation_logs
  FOR EACH ROW EXECUTE FUNCTION public.zz_ai_conversation_logs_protect_content();