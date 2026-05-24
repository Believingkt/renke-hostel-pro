ALTER TABLE public.meta_ads ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS update_meta_ads_updated_at ON public.meta_ads;
CREATE TRIGGER update_meta_ads_updated_at
BEFORE UPDATE ON public.meta_ads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();