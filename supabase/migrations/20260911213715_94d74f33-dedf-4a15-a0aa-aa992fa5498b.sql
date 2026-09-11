CREATE TABLE public.translation_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_column text NOT NULL,
  source_id text NOT NULL,
  source_hash text NOT NULL,
  lang text NOT NULL,
  translated_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT translation_cache_unique UNIQUE (source_table, source_column, source_id, lang, source_hash)
);

CREATE INDEX idx_translation_cache_lookup
  ON public.translation_cache (lang, source_hash);

GRANT SELECT ON public.translation_cache TO anon;
GRANT SELECT ON public.translation_cache TO authenticated;
GRANT ALL ON public.translation_cache TO service_role;

ALTER TABLE public.translation_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "translation_cache_public_read"
  ON public.translation_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "translation_cache_service_role_all"
  ON public.translation_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_translation_cache_updated_at
  BEFORE UPDATE ON public.translation_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();