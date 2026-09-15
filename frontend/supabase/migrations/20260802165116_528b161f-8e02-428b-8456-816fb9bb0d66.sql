UPDATE public.franchise_commission_settings
SET project_name = '森山寫照第一期'
WHERE project_name = '森山第一期';

ALTER TABLE public.franchise_commission_settings
  ALTER COLUMN project_name SET DEFAULT '森山寫照第一期';