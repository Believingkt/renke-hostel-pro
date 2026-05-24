ALTER TABLE public.meta_ad_weekly ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meta_ad_weekly FROM sandbox_exec;