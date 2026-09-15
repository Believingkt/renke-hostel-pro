-- ============================================================
-- Phase 3 / Step 1: OwlTing 訂單同步 schema
-- ============================================================

-- 1. accommodation_owlting_config -----------------------------
CREATE TABLE IF NOT EXISTS public.accommodation_owlting_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  owlting_hotel_code text NOT NULL,
  cm_api_endpoint_url text NOT NULL DEFAULT 'https://api.owlting.com/cm2/api/lakeze/prod/order',
  sync_enabled boolean NOT NULL DEFAULT false,
  last_successful_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (accommodation_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accommodation_owlting_config TO authenticated;
GRANT ALL ON public.accommodation_owlting_config TO service_role;
ALTER TABLE public.accommodation_owlting_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read owlting config"
  ON public.accommodation_owlting_config FOR SELECT TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );
CREATE POLICY "Admins insert owlting config"
  ON public.accommodation_owlting_config FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );
CREATE POLICY "Admins update owlting config"
  ON public.accommodation_owlting_config FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );
CREATE POLICY "Admins delete owlting config"
  ON public.accommodation_owlting_config FOR DELETE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );

CREATE TRIGGER trg_acc_owlting_config_updated_at
  BEFORE UPDATE ON public.accommodation_owlting_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. numeric_code + owlting_sync_active -----------------------
ALTER TABLE public.room_types
  ADD COLUMN IF NOT EXISTS numeric_code int,
  ADD COLUMN IF NOT EXISTS owlting_sync_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.accommodation_packages
  ADD COLUMN IF NOT EXISTS numeric_code int;

-- 回填 room_types.numeric_code（每個 accommodation 從 1001 起跳）
WITH ranked AS (
  SELECT id,
         1000 + ROW_NUMBER() OVER (
           PARTITION BY accommodation_id
           ORDER BY created_at NULLS LAST, id
         ) AS new_code
  FROM public.room_types
  WHERE numeric_code IS NULL
)
UPDATE public.room_types rt
SET numeric_code = ranked.new_code
FROM ranked
WHERE rt.id = ranked.id;

-- 回填 accommodation_packages.numeric_code
WITH ranked AS (
  SELECT id,
         1000 + ROW_NUMBER() OVER (
           PARTITION BY accommodation_id
           ORDER BY created_at NULLS LAST, id
         ) AS new_code
  FROM public.accommodation_packages
  WHERE numeric_code IS NULL
)
UPDATE public.accommodation_packages ap
SET numeric_code = ranked.new_code
FROM ranked
WHERE ap.id = ranked.id;

-- UNIQUE：每個 accommodation 內 numeric_code 不重複
CREATE UNIQUE INDEX IF NOT EXISTS room_types_acc_numeric_code_uidx
  ON public.room_types (accommodation_id, numeric_code);
CREATE UNIQUE INDEX IF NOT EXISTS accommodation_packages_acc_numeric_code_uidx
  ON public.accommodation_packages (accommodation_id, numeric_code);

-- 自動編號：trigger 在 INSERT 時若沒帶 numeric_code，從該 accommodation 的 MAX+1（最低 1001）取
CREATE OR REPLACE FUNCTION public.assign_numeric_code_room_types()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.numeric_code IS NULL AND NEW.accommodation_id IS NOT NULL THEN
    SELECT GREATEST(1001, COALESCE(MAX(numeric_code), 1000) + 1)
      INTO NEW.numeric_code
    FROM public.room_types
    WHERE accommodation_id = NEW.accommodation_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_numeric_code_packages()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.numeric_code IS NULL AND NEW.accommodation_id IS NOT NULL THEN
    SELECT GREATEST(1001, COALESCE(MAX(numeric_code), 1000) + 1)
      INTO NEW.numeric_code
    FROM public.accommodation_packages
    WHERE accommodation_id = NEW.accommodation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_types_assign_numeric_code ON public.room_types;
CREATE TRIGGER trg_room_types_assign_numeric_code
  BEFORE INSERT ON public.room_types
  FOR EACH ROW EXECUTE FUNCTION public.assign_numeric_code_room_types();

DROP TRIGGER IF EXISTS trg_packages_assign_numeric_code ON public.accommodation_packages;
CREATE TRIGGER trg_packages_assign_numeric_code
  BEFORE INSERT ON public.accommodation_packages
  FOR EACH ROW EXECUTE FUNCTION public.assign_numeric_code_packages();

-- 3. 推送佇列 -------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.owlting_res_status AS ENUM ('Commit','Modify','Cancel');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.owlting_push_status AS ENUM ('pending','sending','sent','failed','skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.owlting_order_push_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  res_status public.owlting_res_status NOT NULL,
  echo_token text NOT NULL,
  status public.owlting_push_status NOT NULL DEFAULT 'pending',
  attempt_count int NOT NULL DEFAULT 0,
  last_error text,
  next_retry_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS owlting_order_push_queue_status_next_retry_idx
  ON public.owlting_order_push_queue (status, next_retry_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owlting_order_push_queue TO authenticated;
GRANT ALL ON public.owlting_order_push_queue TO service_role;
ALTER TABLE public.owlting_order_push_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read owlting push queue"
  ON public.owlting_order_push_queue FOR SELECT TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );
CREATE POLICY "Admins insert owlting push queue"
  ON public.owlting_order_push_queue FOR INSERT TO authenticated
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );
CREATE POLICY "Admins update owlting push queue"
  ON public.owlting_order_push_queue FOR UPDATE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );
CREATE POLICY "Admins delete owlting push queue"
  ON public.owlting_order_push_queue FOR DELETE TO authenticated
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );

-- 4. 推送 log -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.owlting_order_push_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid REFERENCES public.owlting_order_push_queue(id) ON DELETE SET NULL,
  accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE SET NULL,
  res_status text,
  request_xml text,
  response_xml text,
  owlnest_md5 text,
  http_status int,
  duration_ms int,
  success boolean,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS owlting_order_push_log_accommodation_idx
  ON public.owlting_order_push_log (accommodation_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owlting_order_push_log TO authenticated;
GRANT ALL ON public.owlting_order_push_log TO service_role;
ALTER TABLE public.owlting_order_push_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read owlting push log"
  ON public.owlting_order_push_log FOR SELECT TO authenticated
  USING (
    accommodation_id IS NOT NULL AND (
      user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
      OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    )
  );
-- log 只允許 service_role 寫入（Edge Function 用），不開放一般 authenticated insert/update/delete

-- 5. orders 加欄位 --------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS owlting_sync_state jsonb,
  ADD COLUMN IF NOT EXISTS owlting_unique_id text;
