CREATE OR REPLACE VIEW public.kol_profiles_with_progress AS
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
    k.contract_group_id
   FROM kol_profiles k
     LEFT JOIN orders o ON o.order_number = btrim(k.order_number);