CREATE TABLE public.ai_assistant_consents (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  consented BOOLEAN NOT NULL DEFAULT false,
  consent_version TEXT NOT NULL DEFAULT 'v1',
  consented_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_assistant_consents TO authenticated;
GRANT ALL ON public.ai_assistant_consents TO service_role;

ALTER TABLE public.ai_assistant_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage their own AI consent"
ON public.ai_assistant_consents
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_ai_assistant_consents_updated_at
BEFORE UPDATE ON public.ai_assistant_consents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();