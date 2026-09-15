-- 1. 範本表
CREATE TABLE public.permission_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (accommodation_id, name)
);

CREATE INDEX idx_permission_templates_accommodation ON public.permission_templates(accommodation_id);

ALTER TABLE public.permission_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage permission templates"
  ON public.permission_templates
  FOR ALL
  TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  )
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );

CREATE POLICY "Staff can view templates in their accommodation"
  ON public.permission_templates
  FOR SELECT
  TO authenticated
  USING (user_has_access_to_accommodation(auth.uid(), accommodation_id));

CREATE TRIGGER update_permission_templates_updated_at
  BEFORE UPDATE ON public.permission_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. 在 user_roles 標記套用的範本（純顯示用）
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.permission_templates(id) ON DELETE SET NULL;

-- 3. 為每間民宿建立三組預設範本
INSERT INTO public.permission_templates (accommodation_id, name, description, permissions, is_system, display_order)
SELECT
  ai.id,
  v.name,
  v.description,
  v.permissions::jsonb,
  true,
  v.ord
FROM public.accommodation_info ai
CROSS JOIN (VALUES
  ('現場營運', '櫃檯、訂單、房價庫存可編輯；分析/網紅/請款唯讀；設定類隱藏',
   '{"orders":"editable","room_price":"editable","customers":"editable","analytics":"readonly","discount_codes":"readonly","settlement":"readonly","website_content":"hidden","pricing":"hidden","accounts":"hidden"}', 1),
  ('財務', '請款、訂單付款狀態可編輯；分析/網紅唯讀；其餘隱藏',
   '{"settlement":"editable","orders":"editable","analytics":"readonly","discount_codes":"readonly","customers":"readonly","room_price":"hidden","website_content":"hidden","pricing":"hidden","accounts":"hidden"}', 2),
  ('業主', '所有營運模組唯讀，僅供查看報表與資料',
   '{"analytics":"readonly","orders":"readonly","customers":"readonly","room_price":"readonly","discount_codes":"readonly","settlement":"readonly","website_content":"readonly","pricing":"readonly","accounts":"hidden"}', 3)
) AS v(name, description, permissions, ord)
ON CONFLICT (accommodation_id, name) DO NOTHING;