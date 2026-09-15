CREATE OR REPLACE FUNCTION public.admin_delete_order(_order_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '請先登入' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'::public.app_role
  ) THEN
    RAISE EXCEPTION '只有超級管理員可以刪除訂單' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到此訂單' USING ERRCODE = 'P0001';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.audit_logs (
    accommodation_id, user_id, user_email, action_type, action_category,
    entity_type, entity_id, entity_name, details
  ) VALUES (
    v_order.accommodation_id, auth.uid(), v_email, 'delete', 'order',
    'orders', _order_id::text, v_order.order_number,
    jsonb_build_object('reason', _reason, 'snapshot', to_jsonb(v_order))
  );

  -- 清理阻擋刪除（NO ACTION）的關聯資料
  UPDATE public.kol_profiles SET order_id = NULL WHERE order_id = _order_id;
  DELETE FROM public.closer_commission_adjustments WHERE order_id = _order_id;
  DELETE FROM public.closer_commission_snapshots WHERE order_id = _order_id;
  DELETE FROM public.order_commissions WHERE order_id = _order_id;

  DELETE FROM public.orders WHERE id = _order_id;

  RETURN jsonb_build_object('success', true, 'order_number', v_order.order_number);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_order(uuid, text) TO authenticated;