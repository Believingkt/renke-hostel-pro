
-- Enums
DO $$ BEGIN
  CREATE TYPE public.ai_prompt_status AS ENUM ('draft','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_knowledge_category AS ENUM ('room','facility','policy','location','faq','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_conversation_rating AS ENUM ('good','bad');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- helper: is super_admin or hotel_admin (any accommodation)
CREATE OR REPLACE FUNCTION public.is_admin_or_super()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin'::app_role, 'hotel_admin'::app_role)
  );
$$;

-- 1) ai_prompts
CREATE TABLE public.ai_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version int NOT NULL,
  status public.ai_prompt_status NOT NULL DEFAULT 'draft',
  persona_name text NOT NULL DEFAULT '小安',
  persona_avatar_url text,
  system_prompt text NOT NULL DEFAULT '',
  tone_rules text,
  forbidden_topics text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE UNIQUE INDEX ai_prompts_version_uk ON public.ai_prompts(version);
ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_prompts admin all" ON public.ai_prompts FOR ALL
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

-- 2) ai_knowledge
CREATE TABLE public.ai_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category public.ai_knowledge_category NOT NULL DEFAULT 'other',
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  priority int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_knowledge admin all" ON public.ai_knowledge FOR ALL
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());
CREATE TRIGGER ai_knowledge_set_updated_at
  BEFORE UPDATE ON public.ai_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) ai_examples
CREATE TABLE public.ai_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario text NOT NULL,
  user_message text NOT NULL,
  ideal_response text NOT NULL,
  explanation text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_examples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_examples admin all" ON public.ai_examples FOR ALL
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());

-- 4) ai_conversation_logs
CREATE TABLE public.ai_conversation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  prompt_version int,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_rating public.ai_conversation_rating,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_conversation_logs_session_idx ON public.ai_conversation_logs(session_id);
CREATE INDEX ai_conversation_logs_created_idx ON public.ai_conversation_logs(created_at DESC);
ALTER TABLE public.ai_conversation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_conversation_logs admin all" ON public.ai_conversation_logs FOR ALL
  USING (public.is_admin_or_super()) WITH CHECK (public.is_admin_or_super());
