-- 2026-09-19 遷移前置：public.pricing_rules 在舊專案存在（於 Lovable 內直接建立、未進 migrations），
-- 後續 13 個 migration 會引用它。定義取自 2026-09-19 匯出檔的 schema；policies 由後續 migration 建立。
CREATE TABLE IF NOT EXISTS public.pricing_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    accommodation_id uuid NOT NULL,
    room_type_id uuid NOT NULL,
    rule_name text NOT NULL,
    day_type text NOT NULL,
    price integer,
    price_2_meals integer,
    price_3_meals integer,
    available_rooms integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pricing_rules_pkey PRIMARY KEY (id),
    CONSTRAINT pricing_rules_day_type_check CHECK ((day_type = ANY (ARRAY['weekday'::text, 'weekend'::text, 'holiday'::text, 'compensatory_day_off'::text, 'work_on_weekend'::text]))),
    CONSTRAINT pricing_rules_accommodation_id_fkey FOREIGN KEY (accommodation_id) REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
    CONSTRAINT pricing_rules_room_type_id_fkey FOREIGN KEY (room_type_id) REFERENCES public.room_types(id) ON DELETE CASCADE
);
COMMENT ON TABLE public.pricing_rules IS 'Automatic pricing rules based on day types';
COMMENT ON COLUMN public.pricing_rules.priority IS 'Higher priority rules override lower priority ones';
CREATE INDEX IF NOT EXISTS idx_pricing_rules_accommodation_room ON public.pricing_rules USING btree (accommodation_id, room_type_id);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_active ON public.pricing_rules USING btree (is_active) WHERE (is_active = true);
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column')
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_pricing_rules_updated_at') THEN
    CREATE TRIGGER update_pricing_rules_updated_at BEFORE UPDATE ON public.pricing_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
GRANT ALL ON TABLE public.pricing_rules TO anon, authenticated, service_role;
