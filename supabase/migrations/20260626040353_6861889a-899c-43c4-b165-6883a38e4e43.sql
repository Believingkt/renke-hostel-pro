
-- =========================================================
-- HotelNabe inbound integration — Step 1 (schema + safeguards)
-- =========================================================

-- 1) accommodation_hotelnabe_config
CREATE TABLE public.accommodation_hotelnabe_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  hotelnabe_hotel_code text NOT NULL UNIQUE,
  inbound_enabled boolean NOT NULL DEFAULT false,
  last_received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (accommodation_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accommodation_hotelnabe_config TO authenticated;
GRANT ALL ON public.accommodation_hotelnabe_config TO service_role;

ALTER TABLE public.accommodation_hotelnabe_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read hotelnabe config" ON public.accommodation_hotelnabe_config
  FOR SELECT USING (
    public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );
CREATE POLICY "Admins insert hotelnabe config" ON public.accommodation_hotelnabe_config
  FOR INSERT WITH CHECK (
    public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );
CREATE POLICY "Admins update hotelnabe config" ON public.accommodation_hotelnabe_config
  FOR UPDATE USING (
    public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );
CREATE POLICY "Admins delete hotelnabe config" ON public.accommodation_hotelnabe_config
  FOR DELETE USING (
    public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );

CREATE TRIGGER trg_hotelnabe_config_updated_at
  BEFORE UPDATE ON public.accommodation_hotelnabe_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) hotelnabe_order_inbound_log
CREATE TABLE public.hotelnabe_order_inbound_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  echo_token text,
  hotelnabe_hotel_code text,
  hotelnabe_res_id text,
  ota_code text,
  ota_res_id text,
  res_status text,
  request_xml text,
  response_xml text,
  parsed_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  http_status int,
  success boolean,
  error_message text,
  mode text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hotelnabe_log_res_id ON public.hotelnabe_order_inbound_log (hotelnabe_res_id);

GRANT SELECT ON public.hotelnabe_order_inbound_log TO authenticated;
GRANT ALL ON public.hotelnabe_order_inbound_log TO service_role;

ALTER TABLE public.hotelnabe_order_inbound_log ENABLE ROW LEVEL SECURITY;

-- HQ admin only (super_admin)
CREATE POLICY "HQ admin read hotelnabe log" ON public.hotelnabe_order_inbound_log
  FOR SELECT USING (public.is_super_admin(auth.uid()));

-- 3) orders 加欄位
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS hotelnabe_res_id text,
  ADD COLUMN IF NOT EXISTS hotelnabe_last_modify timestamptz,
  ADD COLUMN IF NOT EXISTS hotelnabe_sync_state jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_hotelnabe_res_id
  ON public.orders (hotelnabe_res_id)
  WHERE hotelnabe_res_id IS NOT NULL;

-- 4) 防呆一：擴充 owlting enqueue trigger，hotelnabe 來源不反推
CREATE OR REPLACE FUNCTION public.fn_orders_owlting_enqueue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg_exists boolean;
  v_sync_enabled boolean;
  v_queue_status text;
  v_res_status text;
  v_echo_token text;
  v_was_active boolean;
  v_is_active boolean;
  v_relevant_change boolean;
BEGIN
  SELECT TRUE, sync_enabled INTO v_cfg_exists, v_sync_enabled
  FROM public.accommodation_owlting_config
  WHERE accommodation_id = NEW.accommodation_id;

  v_queue_status := CASE WHEN COALESCE(v_cfg_exists, FALSE) AND COALESCE(v_sync_enabled, FALSE)
                         THEN 'pending' ELSE 'skipped' END;

  IF TG_OP = 'INSERT' THEN
    -- 改動：新增 hotelnabe，避免從旭海進來的訂單反推回 OwlNest
    IF COALESCE(NEW.order_source, '') IN ('owlting','hotelnabe') THEN RETURN NEW; END IF;
    IF NEW.order_status NOT IN ('confirmed','pending') THEN RETURN NEW; END IF;
    v_res_status := 'Commit';

  ELSIF TG_OP = 'UPDATE' THEN
    v_was_active := OLD.order_status IN ('confirmed','pending','hold','checked_in');
    v_is_active  := NEW.order_status IN ('confirmed','pending','hold','checked_in');

    v_relevant_change := (
         NEW.check_in_date  IS DISTINCT FROM OLD.check_in_date
      OR NEW.check_out_date IS DISTINCT FROM OLD.check_out_date
      OR NEW.room_type_id   IS DISTINCT FROM OLD.room_type_id
      OR NEW.guest_count    IS DISTINCT FROM OLD.guest_count
      OR NEW.total_price    IS DISTINCT FROM OLD.total_price
      OR NEW.final_price    IS DISTINCT FROM OLD.final_price
      OR NEW.package_id     IS DISTINCT FROM OLD.package_id
    );

    IF OLD.order_status <> 'cancelled' AND NEW.order_status = 'cancelled' THEN
      v_res_status := 'Cancel';
    ELSIF (NOT v_was_active) AND v_is_active
          AND NEW.order_status IN ('confirmed','pending') THEN
      v_res_status := 'Commit';
    ELSIF v_was_active AND v_is_active AND v_relevant_change THEN
      v_res_status := 'Modify';
    ELSE
      RETURN NEW;
    END IF;

    -- 改動：hotelnabe 來源完全不反推（含 Cancel/Modify/Commit）
    IF COALESCE(NEW.order_source, '') = 'hotelnabe' THEN
      RETURN NEW;
    END IF;

    -- 改動：原本只擋 owlting，現在維持 owlting 行為（Cancel 仍會推）
    IF COALESCE(NEW.order_source, '') = 'owlting'
       AND v_res_status NOT IN ('Cancel') AND NOT v_relevant_change THEN
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  v_echo_token := 'RENKE-' || NEW.order_number || '-'
                  || (extract(epoch from clock_timestamp()) * 1000)::bigint::text
                  || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);

  INSERT INTO public.owlting_order_push_queue
    (accommodation_id, order_id, res_status, echo_token, status)
  VALUES
    (NEW.accommodation_id, NEW.id, v_res_status::public.owlting_res_status, v_echo_token, v_queue_status::public.owlting_push_status);

  RETURN NEW;
END;
$function$;

-- 5) 防呆二：accommodation_info 加 channel_manager 旗標
ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS channel_manager text NOT NULL DEFAULT 'none';

ALTER TABLE public.accommodation_info
  DROP CONSTRAINT IF EXISTS accommodation_info_channel_manager_check;
ALTER TABLE public.accommodation_info
  ADD CONSTRAINT accommodation_info_channel_manager_check
  CHECK (channel_manager IN ('none','owlting','hotelnabe'));
