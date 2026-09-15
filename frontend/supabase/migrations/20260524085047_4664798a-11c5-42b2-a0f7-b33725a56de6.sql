GRANT ALL ON public.meta_ad_weekly TO postgres, service_role, authenticator;
ALTER TABLE public.meta_ad_weekly DISABLE ROW LEVEL SECURITY;