ALTER TABLE public.ai_knowledge
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(content, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_search_tsv ON public.ai_knowledge USING gin (search_tsv);

CREATE OR REPLACE FUNCTION public.search_ai_knowledge(
  p_query text,
  p_category public.ai_knowledge_category DEFAULT NULL,
  p_accommodation_id uuid DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  title text,
  category public.ai_knowledge_category,
  content text,
  snippet text,
  rank real,
  is_active boolean,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (
    SELECT plainto_tsquery('simple', coalesce(p_query, '')) AS tsq
  )
  SELECT
    k.id,
    k.title,
    k.category,
    k.content,
    ts_headline('simple', k.content, (SELECT tsq FROM q),
      'StartSel=<mark>,StopSel=</mark>,MaxWords=40,MinWords=15,ShortWord=1,MaxFragments=2') AS snippet,
    GREATEST(
      ts_rank(k.search_tsv, (SELECT tsq FROM q)),
      CASE WHEN k.title ILIKE '%' || coalesce(p_query,'') || '%' THEN 0.5::real
           WHEN k.content ILIKE '%' || coalesce(p_query,'') || '%' THEN 0.2::real
           ELSE 0::real END
    ) AS rank,
    k.is_active,
    k.updated_at
  FROM public.ai_knowledge k, q
  WHERE (p_category IS NULL OR k.category = p_category)
    AND (p_accommodation_id IS NULL OR k.accommodation_id = p_accommodation_id OR k.accommodation_id IS NULL)
    AND (
      coalesce(p_query, '') = ''
      OR k.search_tsv @@ q.tsq
      OR k.title ILIKE '%' || p_query || '%'
      OR k.content ILIKE '%' || p_query || '%'
    )
  ORDER BY rank DESC, k.priority DESC, k.updated_at DESC
  LIMIT LEAST(coalesce(p_limit, 20), 100);
$$;

GRANT EXECUTE ON FUNCTION public.search_ai_knowledge(text, public.ai_knowledge_category, uuid, int) TO authenticated, service_role;