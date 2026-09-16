-- 1) 稽核欄位
ALTER TABLE public.ai_knowledge
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 2) INSERT 帶入 created_by + updated_by；UPDATE 只動 updated_by（SECURITY INVOKER，立即收權）
CREATE OR REPLACE FUNCTION public.set_created_and_updated_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.updated_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_created_and_updated_by() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_created_and_updated_by() TO service_role;

DROP TRIGGER IF EXISTS zz_ai_knowledge_set_actor ON public.ai_knowledge;
CREATE TRIGGER zz_ai_knowledge_set_actor
  BEFORE INSERT OR UPDATE ON public.ai_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.set_created_and_updated_by();

-- 3) 館別端寫入權限（既有 5 條政策不動；不給 DELETE）
GRANT INSERT, UPDATE ON public.ai_knowledge TO authenticated;

DROP POLICY IF EXISTS "Accommodation editors insert own knowledge" ON public.ai_knowledge;
CREATE POLICY "Accommodation editors insert own knowledge" ON public.ai_knowledge
  FOR INSERT TO authenticated
  WITH CHECK (
    accommodation_id IS NOT NULL
    AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
    AND public.staff_can_edit_module(accommodation_id, 'ai_faq')
  );

DROP POLICY IF EXISTS "Accommodation editors update own knowledge" ON public.ai_knowledge;
CREATE POLICY "Accommodation editors update own knowledge" ON public.ai_knowledge
  FOR UPDATE TO authenticated
  USING (
    accommodation_id IS NOT NULL
    AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
    AND public.staff_can_edit_module(accommodation_id, 'ai_faq')
  )
  WITH CHECK (
    accommodation_id IS NOT NULL
    AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
    AND public.staff_can_edit_module(accommodation_id, 'ai_faq')
  );