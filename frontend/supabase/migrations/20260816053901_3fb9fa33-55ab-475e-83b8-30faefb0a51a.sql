CREATE INDEX IF NOT EXISTS idx_order_rooms_room_type ON public.order_rooms (room_type_id);

CREATE OR REPLACE FUNCTION public.get_adjusted_room_inventory_batch(
  p_room_type_id uuid,
  p_dates text[],
  p_accommodation_id uuid
)
RETURNS TABLE(date_value date, available_rooms integer, is_blocked boolean, blocked_by_room_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_type record;
BEGIN
  SELECT * INTO v_room_type FROM room_types WHERE id = p_room_type_id;

  RETURN QUERY
  WITH dates AS (
    SELECT DISTINCT unnest(p_dates)::date AS d
  ),
  active_orders AS (
    SELECT o.id, o.check_in_date, o.check_out_date, o.room_type_id,
           COALESCE(o.lock_whole_building, false) AS lock_whole_building,
           NOT EXISTS (SELECT 1 FROM order_rooms orr2 WHERE orr2.order_id = o.id) AS no_rooms
    FROM orders o
    WHERE o.accommodation_id = p_accommodation_id
      AND o.order_status NOT IN ('cancelled')
  ),
  occ AS (
    SELECT dt.d, orr.room_type_id, orr.quantity AS cnt
    FROM dates dt
    JOIN active_orders ao ON dt.d >= ao.check_in_date AND dt.d < ao.check_out_date
    JOIN order_rooms orr ON orr.order_id = ao.id
    UNION ALL
    SELECT dt.d, ao.room_type_id, 1
    FROM dates dt
    JOIN active_orders ao ON dt.d >= ao.check_in_date AND dt.d < ao.check_out_date
    WHERE ao.no_rooms AND ao.room_type_id IS NOT NULL
  ),
  locked AS (
    SELECT DISTINCT dt.d
    FROM dates dt
    JOIN active_orders ao ON ao.lock_whole_building
      AND dt.d >= ao.check_in_date AND dt.d < ao.check_out_date
  ),
  self_booked AS (
    SELECT occ.d, COALESCE(SUM(occ.cnt), 0)::int AS c
    FROM occ WHERE occ.room_type_id = p_room_type_id GROUP BY occ.d
  ),
  inv AS (
    SELECT rip.date AS d, COALESCE(rip.available_rooms, 0) AS a
    FROM room_inventory_pricing rip
    WHERE rip.room_type_id = p_room_type_id
      AND rip.pricing_template_id IS NULL
      AND rip.date IN (SELECT d FROM dates)
  ),
  booked_types AS (
    SELECT DISTINCT occ.d, occ.room_type_id FROM occ WHERE occ.room_type_id IS NOT NULL
  ),
  -- 規則2：本房型設定「佔用即封鎖全區」
  b_all AS (
    SELECT bt.d, min(rt.name) AS name
    FROM booked_types bt JOIN room_types rt ON rt.id = bt.room_type_id
    WHERE COALESCE(v_room_type.blocks_all_inventory, false) = true
      AND rt.accommodation_id = p_accommodation_id
      AND rt.id <> p_room_type_id
      AND COALESCE(rt.blocks_all_inventory, false) = false
      AND (array_length(v_room_type.blocks_all_target_ids, 1) IS NULL
           OR rt.id = ANY(v_room_type.blocks_all_target_ids))
    GROUP BY bt.d
  ),
  -- 規則3：其他房型設定封鎖全區且指向本房型
  b_other AS (
    SELECT bt.d, min(rt.name) AS name
    FROM booked_types bt JOIN room_types rt ON rt.id = bt.room_type_id
    WHERE COALESCE(v_room_type.blocks_all_inventory, false) = false
      AND rt.accommodation_id = p_accommodation_id
      AND rt.id <> p_room_type_id
      AND COALESCE(rt.blocks_all_inventory, false) = true
      AND (array_length(rt.blocks_all_target_ids, 1) IS NULL
           OR p_room_type_id = ANY(rt.blocks_all_target_ids))
    GROUP BY bt.d
  ),
  -- 散客房綁定包棟：任一綁定包棟被訂走
  b_common_bound AS (
    SELECT bt.d, min(rt.name) AS name
    FROM booked_types bt JOIN room_types rt ON rt.id = bt.room_type_id
    WHERE v_room_type.is_bound_to_exclusive = true
      AND COALESCE(v_room_type.is_exclusive_package, false) = false
      AND rt.is_exclusive_package = true
      AND rt.is_bound_to_exclusive = true
      AND (v_room_type.bound_exclusive_ids IS NULL
           OR array_length(v_room_type.bound_exclusive_ids, 1) IS NULL
           OR rt.id = ANY(v_room_type.bound_exclusive_ids))
    GROUP BY bt.d
  ),
  -- 包棟互斥：其他綁定包棟被訂走
  b_pkg_sibling AS (
    SELECT bt.d, min(rt.name) AS name
    FROM booked_types bt JOIN room_types rt ON rt.id = bt.room_type_id
    WHERE COALESCE(v_room_type.is_exclusive_package, false) = true
      AND v_room_type.is_bound_to_exclusive = true
      AND bt.room_type_id <> p_room_type_id
      AND rt.is_exclusive_package = true
      AND rt.is_bound_to_exclusive = true
    GROUP BY bt.d
  ),
  -- 包棟被綁定的散客房訂走
  b_pkg_common AS (
    SELECT bt.d, min(rt.name) AS name
    FROM booked_types bt JOIN room_types rt ON rt.id = bt.room_type_id
    WHERE COALESCE(v_room_type.is_exclusive_package, false) = true
      AND v_room_type.is_bound_to_exclusive = true
      AND rt.is_bound_to_exclusive = true
      AND COALESCE(rt.is_exclusive_package, false) = false
      AND (rt.bound_exclusive_ids IS NULL
           OR array_length(rt.bound_exclusive_ids, 1) IS NULL
           OR p_room_type_id = ANY(rt.bound_exclusive_ids))
    GROUP BY bt.d
  )
  SELECT
    dt.d AS date_value,
    CASE WHEN blk.name IS NOT NULL THEN 0
         ELSE GREATEST(COALESCE(inv.a, 0) - COALESCE(sb.c, 0), 0) END AS available_rooms,
    (blk.name IS NOT NULL) AS is_blocked,
    blk.name AS blocked_by_room_name
  FROM dates dt
  LEFT JOIN inv ON inv.d = dt.d
  LEFT JOIN self_booked sb ON sb.d = dt.d
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      (SELECT '包棟（整棟保留）' FROM locked l WHERE l.d = dt.d),
      (SELECT name FROM b_all x WHERE x.d = dt.d),
      (SELECT name FROM b_other x WHERE x.d = dt.d),
      (SELECT name FROM b_common_bound x WHERE x.d = dt.d),
      (SELECT name FROM b_pkg_sibling x WHERE x.d = dt.d),
      (SELECT name FROM b_pkg_common x WHERE x.d = dt.d)
    ) AS name
  ) blk ON true
  ORDER BY dt.d;
END;
$$;