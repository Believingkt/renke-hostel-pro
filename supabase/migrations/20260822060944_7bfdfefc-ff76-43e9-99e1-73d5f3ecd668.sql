ALTER TABLE public.group_buy_campaigns
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

-- 前置檢查：回傳活動的訂單統計與是否可永久刪除
CREATE OR REPLACE FUNCTION public.group_buy_campaign_delete_precheck(_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
  _pkgs int := 0;
  _orders int := 0;
  _active int := 0;
  _paid int := 0;
  _refunded int := 0;
  _blockers text[] := ARRAY[]::text[];
BEGIN
  SELECT id, title, status, is_archived, accommodation_id INTO c
  FROM public.group_buy_campaigns WHERE id = _campaign_id;

  IF c.id IS NULL THEN
    RETURN jsonb_build_object('exists', false);
  END IF;

  SELECT count(*) INTO _pkgs FROM public.group_buy_campaign_packages WHERE campaign_id = _campaign_id;

  SELECT
    count(*),
    count(*) FILTER (WHERE o.order_status IS DISTINCT FROM 'cancelled'),
    count(*) FILTER (WHERE coalesce(o.paid_amount, 0) > 0 OR o.payment_status IN ('paid', 'deposit_paid')),
    count(*) FILTER (WHERE o.refund_status IS NOT NULL AND o.refund_status <> 'none')
  INTO _orders, _active, _paid, _refunded
  FROM public.group_buy_commissions g
  JOIN public.orders o ON o.id = g.order_id
  WHERE g.campaign_id = _campaign_id;

  IF _active > 0 THEN
    _blockers := _blockers || format('此活動仍有 %s 筆未結束訂單，無法刪除。請先處理訂單或改為下架／封存。', _active);
  END IF;
  IF _orders > 0 AND _active = 0 THEN
    _blockers := _blockers || format('此活動已有 %s 筆歷史訂單，因此不可永久刪除。請改用封存。', _orders);
  END IF;

  RETURN jsonb_build_object(
    'exists', true,
    'campaign_id', c.id,
    'title', c.title,
    'status', c.status,
    'is_archived', c.is_archived,
    'accommodation_id', c.accommodation_id,
    'packages', _pkgs,
    'orders', _orders,
    'active_orders', _active,
    'paid_orders', _paid,
    'refunded_orders', _refunded,
    'can_hard_delete', (_orders = 0),
    'blockers', to_jsonb(_blockers)
  );
END;
$$;

-- 永久刪除：檢查與刪除同一交易，絕不刪除任何 orders
CREATE OR REPLACE FUNCTION public.delete_group_buy_campaign(_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  info jsonb;
BEGIN
  PERFORM 1 FROM public.group_buy_campaigns WHERE id = _campaign_id FOR UPDATE;

  info := public.group_buy_campaign_delete_precheck(_campaign_id);

  IF NOT coalesce((info->>'exists')::boolean, false) THEN
    RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND';
  END IF;

  IF NOT coalesce((info->>'can_hard_delete')::boolean, false) THEN
    RAISE EXCEPTION '%', coalesce(info->'blockers'->>0, '此活動不可永久刪除，請改用封存。');
  END IF;

  DELETE FROM public.group_buy_payment_events WHERE campaign_id = _campaign_id;
  DELETE FROM public.group_buy_campaigns WHERE id = _campaign_id;

  RETURN jsonb_build_object('deleted', true, 'campaign_id', _campaign_id, 'precheck', info);
END;
$$;

REVOKE ALL ON FUNCTION public.group_buy_campaign_delete_precheck(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_group_buy_campaign(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_buy_campaign_delete_precheck(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_group_buy_campaign(uuid) TO service_role;