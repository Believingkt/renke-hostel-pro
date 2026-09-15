REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.translation_cache FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.translation_cache FROM authenticated;
GRANT SELECT ON public.translation_cache TO anon;
GRANT SELECT ON public.translation_cache TO authenticated;