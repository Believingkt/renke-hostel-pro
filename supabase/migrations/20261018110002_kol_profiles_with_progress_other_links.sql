-- ============================================================
-- kol_profiles_with_progress 補上 other_links、other_links_text
-- 原因：這兩欄只加在 kol_profiles（20261018110000、20261018110001），view 沒有重建，
--       /team/kol 搜尋出現「column kol_profiles_with_progress.other_links_text does not exist」
-- 做法：沿用 20260821093619 的定義原樣不動，只在最後（k.contract_group_id 之後）加兩欄；
--       保留 security_invoker = true；不 DROP VIEW
-- ============================================================

-- PRECHECK
DO $$
DECLARE
  v_cols text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kol_profiles' AND column_name = 'other_links'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kol_profiles' AND column_name = 'other_links_text'
  ) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：kol_profiles 缺 other_links 或 other_links_text，請先套 20261018110000、20261018110001';
  END IF;

  SELECT string_agg(attname, ',' ORDER BY attnum) INTO v_cols
  FROM pg_attribute
  WHERE attrelid = 'public.kol_profiles_with_progress'::regclass AND attnum > 0 AND NOT attisdropped;

  IF v_cols IS DISTINCT FROM
    'id,accommodation_id,name,ig_handle,ig_url,rarity,scout_id,cid_code,short_url,lihi_url,invited_at,check_in_date,check_out_date,day_of_week,inventory_status,booking_status,contract_progress,contract_file_url,task_pre_stay,task_post_story,task_ig_collab,publish_url,publish_date,kol_tags,order_id,order_number,kpi_eligible,kpi_month,is_error,error_note,corrected_by,corrected_at,inventory_count,created_by,created_at,updated_at,scout_name,notes,kpi_qualified,venue_name,cid_configured,cid_notified,kol_direct_ticket_link,companion_cid,public_token,token_expires_at,follower_count,follower_count_updated_at,venue_id,primary_profile_id,collab_progress,anomaly_reason,contract_group_id'
  THEN
    RAISE EXCEPTION 'PRECHECK 失敗：kol_profiles_with_progress 目前欄位和預期不同（可能已套過或被改過）：%', v_cols;
  END IF;
END $$;

CREATE OR REPLACE VIEW public.kol_profiles_with_progress
WITH (security_invoker = true) AS
 SELECT k.id,
    k.accommodation_id,
    k.name,
    k.ig_handle,
    k.ig_url,
    k.rarity,
    k.scout_id,
    k.cid_code,
    k.short_url,
    k.lihi_url,
    k.invited_at,
    k.check_in_date,
    k.check_out_date,
    k.day_of_week,
    k.inventory_status,
    k.booking_status,
    k.contract_progress,
    k.contract_file_url,
    k.task_pre_stay,
    k.task_post_story,
    k.task_ig_collab,
    k.publish_url,
    k.publish_date,
    k.kol_tags,
    k.order_id,
    k.order_number,
    k.kpi_eligible,
    k.kpi_month,
    k.is_error,
    k.error_note,
    k.corrected_by,
    k.corrected_at,
    k.inventory_count,
    k.created_by,
    k.created_at,
    k.updated_at,
    k.scout_name,
    k.notes,
    k.kpi_qualified,
    k.venue_name,
    k.cid_configured,
    k.cid_notified,
    k.kol_direct_ticket_link,
    k.companion_cid,
    k.public_token,
    k.token_expires_at,
    k.follower_count,
    k.follower_count_updated_at,
    k.venue_id,
    k.primary_profile_id,
        CASE
            WHEN NULLIF(btrim(COALESCE(k.order_number, ''::text)), ''::text) IS NOT NULL AND o.order_number IS NULL AND (EXISTS ( SELECT 1
               FROM audit_logs al
              WHERE al.entity_type = 'order'::text AND al.action_type = 'create'::text AND al.entity_name = btrim(k.order_number))) THEN '異常需檢查'::text
            WHEN NULLIF(btrim(COALESCE(k.publish_url, ''::text)), ''::text) IS NOT NULL THEN
            CASE
                WHEN k.check_in_date IS NOT NULL AND (now() AT TIME ZONE 'Asia/Taipei'::text)::date < k.check_in_date THEN '異常需檢查'::text
                ELSE '已上片'::text
            END
            WHEN NULLIF(btrim(COALESCE(k.order_number, ''::text)), ''::text) IS NULL OR o.order_number IS NULL THEN '未訂房'::text
            WHEN o.order_status = 'cancelled'::text THEN '已取消'::text
            ELSE
            CASE
                WHEN k.check_in_date IS NOT NULL AND (now() AT TIME ZONE 'Asia/Taipei'::text)::date >= k.check_in_date AND o.order_status = 'confirmed'::text THEN '入住未上片'::text
                ELSE '未入住'::text
            END
        END AS collab_progress,
        CASE
            WHEN NULLIF(btrim(COALESCE(k.order_number, ''::text)), ''::text) IS NOT NULL AND o.order_number IS NULL AND (EXISTS ( SELECT 1
               FROM audit_logs al
              WHERE al.entity_type = 'order'::text AND al.action_type = 'create'::text AND al.entity_name = btrim(k.order_number))) THEN 'order_deleted'::text
            WHEN NULLIF(btrim(COALESCE(k.publish_url, ''::text)), ''::text) IS NOT NULL AND k.check_in_date IS NOT NULL AND (now() AT TIME ZONE 'Asia/Taipei'::text)::date < k.check_in_date THEN 'published_before_checkin'::text
            ELSE NULL::text
        END AS anomaly_reason,
    k.contract_group_id,
    k.other_links,
    k.other_links_text
   FROM kol_profiles k
     LEFT JOIN orders o ON o.order_number = btrim(k.order_number);

-- POSTCHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.kol_profiles_with_progress'::regclass
      AND 'security_invoker=true' = ANY (reloptions)
  ) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：security_invoker 不是 true';
  END IF;
  IF (SELECT string_agg(attname, ',' ORDER BY attnum) FROM pg_attribute
      WHERE attrelid = 'public.kol_profiles_with_progress'::regclass AND attnum > 51 AND NOT attisdropped)
     IS DISTINCT FROM 'anomaly_reason,contract_group_id,other_links,other_links_text' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：最後幾欄順序不符';
  END IF;
END $$;
