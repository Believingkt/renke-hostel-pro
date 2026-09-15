-- V5.5C.0 方案 A：訂單通用變更記錄
CREATE TABLE public.order_change_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  accommodation_id uuid NOT NULL,
  order_number     text,
  op               text NOT NULL CHECK (op IN ('insert','update')),
  actor_type       text NOT NULL CHECK (actor_type IN ('user','system','unknown')),
  actor_id         uuid,
  actor_email      text,
  actor_label      text,
  reason           text,
  source           text,
  changed_fields   jsonb NOT NULL DEFAULT '[]'::jsonb,
  txid             bigint NOT NULL DEFAULT txid_current(),
  changed_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.order_change_log IS
  'V5.5C.0 訂單通用變更記錄：由 zzz_order_change_log trigger 自動寫入，含系統自動修改';

CREATE INDEX idx_order_change_log_order ON public.order_change_log (order_id, changed_at DESC);
CREATE INDEX idx_order_change_log_accom ON public.order_change_log (accommodation_id, changed_at DESC);
CREATE INDEX idx_order_change_log_txid  ON public.order_change_log (order_id, txid);

GRANT SELECT ON public.order_change_log TO authenticated;
GRANT ALL    ON public.order_change_log TO service_role;

ALTER TABLE public.order_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_change_log_select_staff"
ON public.order_change_log
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_staff_module_permission(auth.uid(), accommodation_id, 'orders')
     IN ('editable','readonly')
);

-- context setter
CREATE OR REPLACE FUNCTION public.set_order_change_context(
  p_source      text DEFAULT NULL,
  p_reason      text DEFAULT NULL,
  p_actor_label text DEFAULT NULL,
  p_actor_type  text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM set_config('app.source',      COALESCE(p_source, ''),      true);
  PERFORM set_config('app.reason',      COALESCE(p_reason, ''),      true);
  PERFORM set_config('app.actor_label', COALESCE(p_actor_label, ''), true);
  PERFORM set_config('app.actor_type',  COALESCE(p_actor_type, ''),  true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.set_order_change_context(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_order_change_context(text,text,text,text) TO authenticated, service_role;

-- actor resolver
CREATE OR REPLACE FUNCTION public.resolve_change_actor()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid   uuid  := auth.uid();
  v_type  text  := NULLIF(current_setting('app.actor_type',  true), '');
  v_label text  := NULLIF(current_setting('app.actor_label', true), '');
  v_email text;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    RETURN jsonb_build_object('actor_type', COALESCE(v_type,'user'), 'actor_id', v_uid,
                              'actor_email', v_email, 'actor_label', v_label);
  END IF;
  IF v_type = 'system' OR v_label IS NOT NULL THEN
    RETURN jsonb_build_object('actor_type','system','actor_id',NULL,'actor_email',NULL,
                              'actor_label', COALESCE(v_label,'system'));
  END IF;
  RETURN jsonb_build_object('actor_type','unknown','actor_id',NULL,'actor_email',NULL,
                            'actor_label','unmarked_system');
END;
$fn$;

REVOKE ALL ON FUNCTION public.resolve_change_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_change_actor() TO authenticated, service_role;

-- generic AFTER trigger
CREATE OR REPLACE FUNCTION public.log_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c_full CONSTANT text[] := ARRAY[
    'order_number','accommodation_id','room_type_id','customer_id','package_id','member_id',
    'check_in_date','check_out_date','order_date',
    'guest_count','adult_count','child_count','toddler_count','infant_count','pet_count',
    'meal_plan','display_room_type_name','room_quantity','room_assigned','lock_whole_building',
    'owner_direct','requires_owner_review','is_pii_pending',
    'order_status','payment_status','refund_status','deposit_status','room_charge_status',
    'total_price','discount_amount','final_price','deposit_amount','paid_amount','refunded_amount',
    'pet_plan_price','meal_plan_total',
    'deposit_required_amount','deposit_charged_amount','deposit_refunded_amount','deposit_method',
    'booking_deposit_amount','booking_deposit_percentage',
    'cancellation_fee_amount','cancellation_fee_percent','refund_fee_amount',
    'payment_method','deposit_payment_method','balance_payment_method','payment_provider',
    'discount_code','order_source','ota_channel','import_project','currency_at_booking',
    'room_charge_scheduled_date',
    'confirmed_at','checked_in_at','checked_out_at','cancelled_at','refunded_at',
    'deposit_charged_at','deposit_refunded_at','payment_link_created_at',
    'group_buy_payment_deadline_at','atm_expire_at',
    'internal_email_sent','internal_email_sent_at'
  ];
  c_skip CONSTANT text[] := ARRAY[
    'id','created_at','updated_at','idempotency_key','dedupe_key',
    'owlting_unique_id','owlting_reservation_id',
    'hotelnabe_res_id','hotelnabe_last_modify',
    'auto_created_from_email_id','room_charge_at'
  ];
  v_old   jsonb;
  v_new   jsonb;
  v_key   text;
  v_a     jsonb;
  v_b     jsonb;
  v_items jsonb := '[]'::jsonb;
  v_actor jsonb;
BEGIN
  v_new := to_jsonb(NEW);
  v_old := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;

  IF TG_OP = 'INSERT' THEN
    v_items := jsonb_build_array(jsonb_build_object('field','__created','changed',true));
  ELSE
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      CONTINUE WHEN v_key = ANY (c_skip);
      v_a := v_old -> v_key;
      v_b := v_new -> v_key;
      CONTINUE WHEN v_a IS NOT DISTINCT FROM v_b;
      IF v_key = ANY (c_full) THEN
        v_items := v_items || jsonb_build_object('field', v_key, 'from', v_a, 'to', v_b);
      ELSE
        v_items := v_items || jsonb_build_object('field', v_key, 'changed', true);
      END IF;
    END LOOP;
    IF jsonb_array_length(v_items) = 0 THEN
      RETURN NULL;
    END IF;
  END IF;

  v_actor := public.resolve_change_actor();

  INSERT INTO public.order_change_log (
    order_id, accommodation_id, order_number, op,
    actor_type, actor_id, actor_email, actor_label,
    reason, source, changed_fields, txid
  ) VALUES (
    NEW.id, NEW.accommodation_id, NEW.order_number, lower(TG_OP),
    v_actor->>'actor_type',
    NULLIF(v_actor->>'actor_id','')::uuid,
    v_actor->>'actor_email',
    NULLIF(v_actor->>'actor_label',''),
    NULLIF(current_setting('app.reason', true), ''),
    COALESCE(NULLIF(current_setting('app.source', true), ''), 'unmarked'),
    v_items,
    txid_current()
  );

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'log_order_change failed for order %: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER zzz_order_change_log
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.log_order_change();

-- 押金 trigger：auth.uid() 為 NULL 時不寫 audit_logs
CREATE OR REPLACE FUNCTION public.log_order_deposit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_email text;
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.deposit_status IS DISTINCT FROM OLD.deposit_status THEN
    v_changes := v_changes || jsonb_build_object('deposit_status',
      jsonb_build_object('from', OLD.deposit_status, 'to', NEW.deposit_status));
  END IF;
  IF NEW.deposit_required_amount IS DISTINCT FROM OLD.deposit_required_amount THEN
    v_changes := v_changes || jsonb_build_object('deposit_required_amount',
      jsonb_build_object('from', OLD.deposit_required_amount, 'to', NEW.deposit_required_amount));
  END IF;
  IF NEW.deposit_charged_amount IS DISTINCT FROM OLD.deposit_charged_amount THEN
    v_changes := v_changes || jsonb_build_object('deposit_charged_amount',
      jsonb_build_object('from', OLD.deposit_charged_amount, 'to', NEW.deposit_charged_amount));
  END IF;
  IF NEW.deposit_refunded_amount IS DISTINCT FROM OLD.deposit_refunded_amount THEN
    v_changes := v_changes || jsonb_build_object('deposit_refunded_amount',
      jsonb_build_object('from', OLD.deposit_refunded_amount, 'to', NEW.deposit_refunded_amount));
  END IF;
  IF NEW.deposit_method IS DISTINCT FROM OLD.deposit_method THEN
    v_changes := v_changes || jsonb_build_object('deposit_method',
      jsonb_build_object('from', OLD.deposit_method, 'to', NEW.deposit_method));
  END IF;

  IF v_changes = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  INSERT INTO public.audit_logs (
    accommodation_id, user_id, user_email, action_type, action_category,
    entity_type, entity_id, entity_name, details
  ) VALUES (
    NEW.accommodation_id, v_uid, v_email, 'deposit_change', 'order',
    'order_deposit', NEW.id::text, NEW.order_number, v_changes
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'log_order_deposit_change failed for order %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$fn$;