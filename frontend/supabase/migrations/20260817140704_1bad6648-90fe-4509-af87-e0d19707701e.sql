-- 1) 先把舊三館（房型模式）的折扣碼，依原本勾選的房型換算成對應房價方案
WITH legacy AS (
  SELECT id FROM public.accommodation_info
  WHERE COALESCE(discount_scope_mode, 'pricing_template') = 'room_type'
),
mapped AS (
  SELECT dc.id AS code_id,
         COALESCE(jsonb_agg(DISTINCT to_jsonb(pt.id::text)) FILTER (WHERE pt.id IS NOT NULL), '[]'::jsonb) AS tpl_ids
  FROM public.discount_codes dc
  JOIN legacy l ON l.id = dc.accommodation_id
  LEFT JOIN public.pricing_templates pt
    ON pt.accommodation_id = dc.accommodation_id
   AND (
     -- 折扣碼未勾選房型 = 全部房型適用 -> 全部方案
     dc.applicable_room_types IS NULL
     OR jsonb_array_length(dc.applicable_room_types) = 0
     -- 方案未綁定房型 = 通用方案（例如包棟）
     OR (COALESCE(array_length(pt.room_type_ids, 1), 0) = 0 AND pt.room_type_id IS NULL)
     -- 方案綁定的房型有落在折扣碼勾選清單內
     OR (pt.room_type_id IS NOT NULL
         AND dc.applicable_room_types @> to_jsonb(pt.room_type_id::text))
     OR EXISTS (
       SELECT 1 FROM unnest(COALESCE(pt.room_type_ids, ARRAY[]::uuid[])) AS rt(id)
       WHERE dc.applicable_room_types @> to_jsonb(rt.id::text)
     )
   )
  WHERE COALESCE(jsonb_array_length(dc.applicable_pricing_template_ids), 0) = 0
  GROUP BY dc.id
)
UPDATE public.discount_codes dc
SET applicable_pricing_template_ids = mapped.tpl_ids,
    updated_at = now()
FROM mapped
WHERE dc.id = mapped.code_id
  AND jsonb_array_length(mapped.tpl_ids) > 0;

-- 2) 全館切換為房價方案模式（僅影響之後新建立的訂單驗證，既有訂單資料不動）
UPDATE public.accommodation_info
SET discount_scope_mode = 'pricing_template'
WHERE COALESCE(discount_scope_mode, 'pricing_template') <> 'pricing_template';

-- 3) 預設值維持 pricing_template
ALTER TABLE public.accommodation_info
  ALTER COLUMN discount_scope_mode SET DEFAULT 'pricing_template';