
-- KOL 稀有度設定（版本化）
CREATE TABLE IF NOT EXISTS public.kol_rarity_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  rarity text NOT NULL,
  fan_range_desc text,
  bonus_amount integer NOT NULL DEFAULT 0,
  effective_from date NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kol_rarity_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rarity_settings_read" ON public.kol_rarity_settings;
CREATE POLICY "rarity_settings_read"
  ON public.kol_rarity_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "rarity_settings_manage" ON public.kol_rarity_settings;
CREATE POLICY "rarity_settings_manage"
  ON public.kol_rarity_settings FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin'::app_role,'super_admin'::app_role,'scout_manager'::app_role)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin'::app_role,'super_admin'::app_role,'scout_manager'::app_role)
  ));

-- 初始版本
INSERT INTO public.kol_rarity_settings (rarity, fan_range_desc, bonus_amount, effective_from)
SELECT * FROM (VALUES
  ('N', '5,000 - 20,000', 100, DATE '2025-12-19'),
  ('R', '20,001 - 50,000', 300, DATE '2025-12-19'),
  ('SR', '50,001 - 100,000', 700, DATE '2025-12-19'),
  ('SSR', '100,001 - 200,000', 1100, DATE '2025-12-19'),
  ('UR', '200,001+', 1600, DATE '2025-12-19'),
  ('ck', '等候主管確認', 0, DATE '2025-12-19')
) AS v(rarity, fan_range_desc, bonus_amount, effective_from)
WHERE NOT EXISTS (SELECT 1 FROM public.kol_rarity_settings);

-- KOL 標籤
CREATE TABLE IF NOT EXISTS public.kol_tags (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kol_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kol_tags_read" ON public.kol_tags;
CREATE POLICY "kol_tags_read"
  ON public.kol_tags FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "kol_tags_insert" ON public.kol_tags;
CREATE POLICY "kol_tags_insert"
  ON public.kol_tags FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "kol_tags_update_manage" ON public.kol_tags;
CREATE POLICY "kol_tags_update_manage"
  ON public.kol_tags FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin'::app_role,'super_admin'::app_role,'scout_manager'::app_role)
  ));

DROP POLICY IF EXISTS "kol_tags_delete_manage" ON public.kol_tags;
CREATE POLICY "kol_tags_delete_manage"
  ON public.kol_tags FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin'::app_role,'super_admin'::app_role,'scout_manager'::app_role)
  ));
