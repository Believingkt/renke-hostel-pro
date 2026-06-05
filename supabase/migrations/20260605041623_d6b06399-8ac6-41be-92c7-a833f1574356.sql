UPDATE public.kol_profiles SET public_token = NULL, token_expires_at = NULL;
ALTER TABLE public.kol_profiles ALTER COLUMN public_token DROP DEFAULT;
ALTER TABLE public.kol_profiles ALTER COLUMN token_expires_at DROP DEFAULT;