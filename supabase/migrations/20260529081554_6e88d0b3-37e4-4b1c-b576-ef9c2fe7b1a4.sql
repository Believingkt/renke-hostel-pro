
-- 1. 既有 AI 表加入 accommodation_id（NULL = HQ 全域範本）
ALTER TABLE public.ai_prompts ADD COLUMN IF NOT EXISTS accommodation_id uuid;
ALTER TABLE public.ai_knowledge ADD COLUMN IF NOT EXISTS accommodation_id uuid;
ALTER TABLE public.ai_examples ADD COLUMN IF NOT EXISTS accommodation_id uuid;
ALTER TABLE public.ai_ab_tests ADD COLUMN IF NOT EXISTS accommodation_id uuid;
ALTER TABLE public.ai_conversation_logs ADD COLUMN IF NOT EXISTS accommodation_id uuid;
ALTER TABLE public.ai_conversation_logs ADD COLUMN IF NOT EXISTS source text DEFAULT 'internal';

CREATE INDEX IF NOT EXISTS idx_ai_prompts_accommodation ON public.ai_prompts(accommodation_id);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_accommodation ON public.ai_knowledge(accommodation_id);
CREATE INDEX IF NOT EXISTS idx_ai_examples_accommodation ON public.ai_examples(accommodation_id);
CREATE INDEX IF NOT EXISTS idx_ai_ab_tests_accommodation ON public.ai_ab_tests(accommodation_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversation_logs_accommodation ON public.ai_conversation_logs(accommodation_id);

-- 2. 新表：對外 API 金鑰
CREATE TABLE IF NOT EXISTS public.accommodation_ai_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  rate_limit_per_min integer NOT NULL DEFAULT 30,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ai_api_keys_accommodation ON public.accommodation_ai_api_keys(accommodation_id);
CREATE INDEX IF NOT EXISTS idx_ai_api_keys_hash ON public.accommodation_ai_api_keys(key_hash) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accommodation_ai_api_keys TO authenticated;
GRANT ALL ON public.accommodation_ai_api_keys TO service_role;

ALTER TABLE public.accommodation_ai_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage their accommodation api keys"
ON public.accommodation_ai_api_keys
FOR ALL
TO authenticated
USING (
  public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
  OR public.is_super_admin(auth.uid())
)
WITH CHECK (
  public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
  OR public.is_super_admin(auth.uid())
);

-- 3. 為現有 AI 表的 RLS 加入「該民宿成員可讀寫」政策（既有 HQ super_admin 政策保留）
-- ai_prompts
DROP POLICY IF EXISTS "Accommodation members manage own prompts" ON public.ai_prompts;
CREATE POLICY "Accommodation members manage own prompts"
ON public.ai_prompts
FOR ALL
TO authenticated
USING (
  accommodation_id IS NOT NULL
  AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
)
WITH CHECK (
  accommodation_id IS NOT NULL
  AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

DROP POLICY IF EXISTS "Accommodation members read global prompts" ON public.ai_prompts;
CREATE POLICY "Accommodation members read global prompts"
ON public.ai_prompts
FOR SELECT
TO authenticated
USING (accommodation_id IS NULL);

-- ai_knowledge
DROP POLICY IF EXISTS "Accommodation members manage own knowledge" ON public.ai_knowledge;
CREATE POLICY "Accommodation members manage own knowledge"
ON public.ai_knowledge
FOR ALL
TO authenticated
USING (
  accommodation_id IS NOT NULL
  AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
)
WITH CHECK (
  accommodation_id IS NOT NULL
  AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

DROP POLICY IF EXISTS "Accommodation members read global knowledge" ON public.ai_knowledge;
CREATE POLICY "Accommodation members read global knowledge"
ON public.ai_knowledge
FOR SELECT
TO authenticated
USING (accommodation_id IS NULL);

-- ai_examples
DROP POLICY IF EXISTS "Accommodation members manage own examples" ON public.ai_examples;
CREATE POLICY "Accommodation members manage own examples"
ON public.ai_examples
FOR ALL
TO authenticated
USING (
  accommodation_id IS NOT NULL
  AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
)
WITH CHECK (
  accommodation_id IS NOT NULL
  AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

DROP POLICY IF EXISTS "Accommodation members read global examples" ON public.ai_examples;
CREATE POLICY "Accommodation members read global examples"
ON public.ai_examples
FOR SELECT
TO authenticated
USING (accommodation_id IS NULL);

-- ai_ab_tests
DROP POLICY IF EXISTS "Accommodation members manage own ab tests" ON public.ai_ab_tests;
CREATE POLICY "Accommodation members manage own ab tests"
ON public.ai_ab_tests
FOR ALL
TO authenticated
USING (
  accommodation_id IS NOT NULL
  AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
)
WITH CHECK (
  accommodation_id IS NOT NULL
  AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

-- ai_conversation_logs（已有 super_admin 政策，加上民宿成員讀取）
DROP POLICY IF EXISTS "Accommodation members read own conversation logs" ON public.ai_conversation_logs;
CREATE POLICY "Accommodation members read own conversation logs"
ON public.ai_conversation_logs
FOR SELECT
TO authenticated
USING (
  accommodation_id IS NOT NULL
  AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

DROP POLICY IF EXISTS "Accommodation members update own conversation logs" ON public.ai_conversation_logs;
CREATE POLICY "Accommodation members update own conversation logs"
ON public.ai_conversation_logs
FOR UPDATE
TO authenticated
USING (
  accommodation_id IS NOT NULL
  AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
)
WITH CHECK (
  accommodation_id IS NOT NULL
  AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

-- 4. 安全定義函式：對外 API 金鑰驗證（service_role 用）
CREATE OR REPLACE FUNCTION public.verify_accommodation_ai_api_key(p_key_hash text)
RETURNS TABLE(accommodation_id uuid, key_id uuid, rate_limit_per_min integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT k.accommodation_id, k.id, k.rate_limit_per_min
  FROM public.accommodation_ai_api_keys k
  WHERE k.key_hash = p_key_hash
    AND k.is_active = true
    AND k.revoked_at IS NULL
  LIMIT 1;

  UPDATE public.accommodation_ai_api_keys
  SET last_used_at = now()
  WHERE key_hash = p_key_hash AND is_active = true;
END;
$$;
