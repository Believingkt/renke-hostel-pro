-- 1) 備品項目
CREATE TABLE public.amenity_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL,
  name text NOT NULL,
  unit text,
  total_quantity integer NOT NULL DEFAULT 0 CHECK (total_quantity >= 0),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.amenity_items TO authenticated;
GRANT ALL ON public.amenity_items TO service_role;

ALTER TABLE public.amenity_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Amenity viewers can read items"
ON public.amenity_items FOR SELECT TO authenticated
USING (
  public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR public.staff_can_view_module(accommodation_id, 'pricing')
  OR public.staff_can_view_module(accommodation_id, 'orders')
);

CREATE POLICY "Amenity editors can insert items"
ON public.amenity_items FOR INSERT TO authenticated
WITH CHECK (
  public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR public.staff_can_edit_module(accommodation_id, 'pricing')
);

CREATE POLICY "Amenity editors can update items"
ON public.amenity_items FOR UPDATE TO authenticated
USING (
  public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR public.staff_can_edit_module(accommodation_id, 'pricing')
);

CREATE POLICY "Amenity editors can delete items"
ON public.amenity_items FOR DELETE TO authenticated
USING (
  public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR public.staff_can_edit_module(accommodation_id, 'pricing')
);

CREATE INDEX idx_amenity_items_accommodation ON public.amenity_items(accommodation_id, display_order);

CREATE TRIGGER update_amenity_items_updated_at
BEFORE UPDATE ON public.amenity_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) 訂單備品分配
CREATE TABLE public.order_amenity_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amenity_item_id uuid NOT NULL REFERENCES public.amenity_items(id) ON DELETE CASCADE,
  accommodation_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, amenity_item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_amenity_allocations TO authenticated;
GRANT ALL ON public.order_amenity_allocations TO service_role;

ALTER TABLE public.order_amenity_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Amenity allocation viewers can read"
ON public.order_amenity_allocations FOR SELECT TO authenticated
USING (
  public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR public.staff_can_view_module(accommodation_id, 'orders')
  OR public.staff_can_view_module(accommodation_id, 'pricing')
);

CREATE POLICY "Amenity allocation editors can insert"
ON public.order_amenity_allocations FOR INSERT TO authenticated
WITH CHECK (
  public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR public.staff_can_edit_module(accommodation_id, 'orders')
);

CREATE POLICY "Amenity allocation editors can update"
ON public.order_amenity_allocations FOR UPDATE TO authenticated
USING (
  public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR public.staff_can_edit_module(accommodation_id, 'orders')
);

CREATE POLICY "Amenity allocation editors can delete"
ON public.order_amenity_allocations FOR DELETE TO authenticated
USING (
  public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR public.staff_can_edit_module(accommodation_id, 'orders')
);

CREATE INDEX idx_order_amenity_alloc_order ON public.order_amenity_allocations(order_id);
CREATE INDEX idx_order_amenity_alloc_item ON public.order_amenity_allocations(amenity_item_id);

CREATE TRIGGER update_order_amenity_allocations_updated_at
BEFORE UPDATE ON public.order_amenity_allocations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) 每日使用量查詢
CREATE OR REPLACE FUNCTION public.get_amenity_daily_usage(
  p_accommodation_id uuid,
  p_start date,
  p_end date,
  p_exclude_order_id uuid DEFAULT NULL
)
RETURNS TABLE (amenity_item_id uuid, usage_date date, used_qty integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.amenity_item_id,
         d::date AS usage_date,
         SUM(a.quantity)::int AS used_qty
  FROM public.order_amenity_allocations a
  JOIN public.orders o ON o.id = a.order_id
  CROSS JOIN LATERAL generate_series(o.check_in_date::date, (o.check_out_date::date - 1), interval '1 day') AS d
  WHERE a.accommodation_id = p_accommodation_id
    AND o.order_status <> 'cancelled'
    AND (p_exclude_order_id IS NULL OR a.order_id <> p_exclude_order_id)
    AND d::date >= p_start
    AND d::date <= p_end
  GROUP BY a.amenity_item_id, d::date
$$;

REVOKE ALL ON FUNCTION public.get_amenity_daily_usage(uuid, date, date, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_amenity_daily_usage(uuid, date, date, uuid) TO authenticated, service_role;

-- 4) 超額驗證
CREATE OR REPLACE FUNCTION public.validate_amenity_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_name text;
  v_conflict record;
BEGIN
  SELECT total_quantity, name INTO v_total, v_name
  FROM public.amenity_items WHERE id = NEW.amenity_item_id;

  IF v_total IS NULL THEN
    RAISE EXCEPTION '備品項目不存在';
  END IF;

  SELECT d::date AS day, SUM(a.quantity)::int AS used
  INTO v_conflict
  FROM public.order_amenity_allocations a
  JOIN public.orders o ON o.id = a.order_id
  CROSS JOIN LATERAL generate_series(o.check_in_date::date, (o.check_out_date::date - 1), interval '1 day') AS d
  WHERE a.amenity_item_id = NEW.amenity_item_id
    AND o.order_status <> 'cancelled'
    AND d::date IN (
      SELECT g::date FROM public.orders oo
      CROSS JOIN LATERAL generate_series(oo.check_in_date::date, (oo.check_out_date::date - 1), interval '1 day') AS g
      WHERE oo.id = NEW.order_id
    )
  GROUP BY d::date
  HAVING SUM(a.quantity) > v_total
  LIMIT 1;

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION '備品「%」在 % 已超過可用數量（總數 %，需求 %）', v_name, v_conflict.day, v_total, v_conflict.used;
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_validate_amenity_allocation
AFTER INSERT OR UPDATE ON public.order_amenity_allocations
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION public.validate_amenity_allocation();

-- 5) 訂單日期異動時重新驗證
CREATE OR REPLACE FUNCTION public.revalidate_amenity_on_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  IF (NEW.check_in_date IS DISTINCT FROM OLD.check_in_date
      OR NEW.check_out_date IS DISTINCT FROM OLD.check_out_date
      OR (OLD.order_status = 'cancelled' AND NEW.order_status <> 'cancelled')) THEN
    FOR v_row IN
      SELECT ai.name, ai.total_quantity, x.day, x.used
      FROM public.order_amenity_allocations mine
      JOIN public.amenity_items ai ON ai.id = mine.amenity_item_id
      JOIN LATERAL (
        SELECT d::date AS day, SUM(a.quantity)::int AS used
        FROM public.order_amenity_allocations a
        JOIN public.orders o ON o.id = a.order_id
        CROSS JOIN LATERAL generate_series(o.check_in_date::date, (o.check_out_date::date - 1), interval '1 day') AS d
        WHERE a.amenity_item_id = mine.amenity_item_id
          AND o.order_status <> 'cancelled'
          AND d::date >= NEW.check_in_date::date
          AND d::date <= (NEW.check_out_date::date - 1)
        GROUP BY d::date
        HAVING SUM(a.quantity) > ai.total_quantity
        LIMIT 1
      ) x ON true
      WHERE mine.order_id = NEW.id
      LIMIT 1
    LOOP
      RAISE EXCEPTION '備品「%」在 % 已超過可用數量（總數 %，需求 %）', v_row.name, v_row.day, v_row.total_quantity, v_row.used;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_revalidate_amenity_on_order_change
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.revalidate_amenity_on_order_change();