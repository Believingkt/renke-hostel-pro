CREATE TABLE public.ai_eval_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.ai_conversation_logs(id) ON DELETE SET NULL,
  test_input text NOT NULL DEFAULT '',
  ai_output text NOT NULL DEFAULT '',
  semantic_label text CHECK (semantic_label IN ('correct','acceptable','unusable')),
  needs_human_fix boolean NOT NULL DEFAULT false,
  lang text NOT NULL DEFAULT 'zh' CHECK (lang IN ('zh','ja','en')),
  has_lang_error boolean NOT NULL DEFAULT false,
  reviewer uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_eval_samples TO authenticated;
GRANT ALL ON public.ai_eval_samples TO service_role;

ALTER TABLE public.ai_eval_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view eval samples"
ON public.ai_eval_samples FOR SELECT TO authenticated
USING (public.is_admin_or_super());

CREATE POLICY "Admins can insert eval samples"
ON public.ai_eval_samples FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_super());

CREATE POLICY "Admins can update eval samples"
ON public.ai_eval_samples FOR UPDATE TO authenticated
USING (public.is_admin_or_super())
WITH CHECK (public.is_admin_or_super());

CREATE POLICY "Admins can delete eval samples"
ON public.ai_eval_samples FOR DELETE TO authenticated
USING (public.is_admin_or_super());

CREATE INDEX idx_ai_eval_samples_created_at ON public.ai_eval_samples (created_at DESC);
CREATE INDEX idx_ai_eval_samples_conversation ON public.ai_eval_samples (conversation_id);

CREATE TRIGGER update_ai_eval_samples_updated_at
BEFORE UPDATE ON public.ai_eval_samples
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();