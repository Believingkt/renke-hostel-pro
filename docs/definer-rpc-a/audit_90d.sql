-- 近 90 天異常寫入檢查（唯讀；每段獨立執行；全部 SELECT、不以 WITH 開頭）
-- 前提：A 類函式被 anon／一般登入者呼叫時，auth.uid() 為 null（anon）或為該會員；service role 的 edge function 也是 null
-- 稽核來源：room_inventory_audit_log（房價表觸發器）、order_change_log（訂單觸發器 zzz_order_change_log）；其他表無稽核欄位，改用替代判斷

-- Q1 房價表：目前仍存在的「價格 0 或低於房型底價 30%」列（近 90 天有更新）
SELECT rt.accommodation_id, ai.name AS accommodation_name, rip.room_type_id, rt.name AS room_type_name, rip.date, rip.pricing_template_id, rip.price, rt.base_price, rip.available_rooms, rip.is_available, rip.last_change_source, rip.updated_at
FROM public.room_inventory_pricing rip JOIN public.room_types rt ON rt.id = rip.room_type_id LEFT JOIN public.accommodation_info ai ON ai.id = rt.accommodation_id
WHERE rip.updated_at >= now() - interval '90 days' AND rip.date >= CURRENT_DATE AND (rip.price <= 0 OR (COALESCE(rt.base_price, 0) > 0 AND rip.price < rt.base_price * 0.3))
ORDER BY rip.updated_at DESC LIMIT 500;

-- Q2 房價稽核：沒有登入者（changed_by 為 null）且來源不是 OwlTing（owlting_inbound／owlting_rate）的寫入，依來源與日期彙總
-- 說明：bulk_upsert 的 last_change_source = COALESCE(p_source, 舊值)，攻擊者不帶 p_source 會沿用舊來源（如 manual_edit），所以「來源是前台值但 changed_by 為 null」最可疑
SELECT al.accommodation_id, COALESCE(al.change_source, '(null)') AS change_source, al.action, date_trunc('day', al.changed_at)::date AS day, count(*) AS rows_changed, count(*) FILTER (WHERE al.new_price IS DISTINCT FROM al.old_price) AS price_changed, min(al.new_price) AS min_new_price
FROM public.room_inventory_audit_log al
WHERE al.changed_at >= now() - interval '90 days' AND al.changed_by IS NULL AND COALESCE(al.change_source, '') NOT IN ('owlting_inbound', 'owlting_rate')
GROUP BY 1, 2, 3, 4 ORDER BY 4 DESC, 5 DESC LIMIT 500;

-- Q3 房價稽核：價格被改成 0、或比原價低 70% 以上的單筆紀錄（含有登入者，方便比對）
SELECT al.changed_at, al.accommodation_id, al.room_type_id, al.pricing_template_id, al.date, al.action, al.old_price, al.new_price, al.old_available_rooms, al.new_available_rooms, al.changed_by, al.changed_by_email, al.change_source
FROM public.room_inventory_audit_log al
WHERE al.changed_at >= now() - interval '90 days' AND al.new_price IS NOT NULL AND (al.new_price <= 0 OR (COALESCE(al.old_price, 0) > 0 AND al.new_price < al.old_price * 0.3))
ORDER BY al.changed_at DESC LIMIT 500;

-- Q4 房價稽核：短時間大量變動（10 分鐘內同館 > 200 筆），標出無登入者且非 OwlTing 的比例
SELECT al.accommodation_id, to_timestamp(floor(extract(epoch FROM al.changed_at) / 600) * 600) AS bucket_10min, count(*) AS rows_changed, count(*) FILTER (WHERE al.changed_by IS NULL AND COALESCE(al.change_source, '') NOT IN ('owlting_inbound', 'owlting_rate')) AS rows_no_actor_non_owlting, string_agg(DISTINCT COALESCE(al.change_source, '(null)'), ',') AS sources
FROM public.room_inventory_audit_log al
WHERE al.changed_at >= now() - interval '90 days'
GROUP BY 1, 2 HAVING count(*) > 200 ORDER BY 2 DESC LIMIT 200;

-- Q5 團購活動刪除：無刪除稽核；delete_group_buy_campaign 只能刪「沒有任何訂單」的活動，並連帶刪 packages／drafts／commissions（cascade）與 payment_events
-- 替代判斷 A：活動綁定的折扣碼還在、但已找不到任何活動引用（活動被刪後的殘留）
SELECT dc.id AS discount_code_id, dc.accommodation_id, dc.code, dc.name, dc.created_at, dc.updated_at
FROM public.discount_codes dc
WHERE dc.created_at >= now() - interval '120 days' AND (dc.name ILIKE '%團購%' OR dc.code ILIKE 'GB%') AND NOT EXISTS (SELECT 1 FROM public.group_buy_campaigns c WHERE c.discount_code_id = dc.id)
ORDER BY dc.created_at DESC LIMIT 200;
-- 替代判斷 B：團購通知／付款保留曾出現、但活動已不存在（notifications 無 FK，會殘留）
SELECT n.created_at, n.accommodation_id, n.type, n.title, left(n.description, 200) AS description
FROM public.notifications n
WHERE n.created_at >= now() - interval '90 days' AND n.title ILIKE '%團購%'
ORDER BY n.created_at DESC LIMIT 200;
-- 替代判斷 C：目前活動總數與各館最新建立時間（請與後台記憶／Ragic 等外部紀錄比對是否短少）
SELECT c.accommodation_id, count(*) AS campaigns, count(*) FILTER (WHERE c.is_archived) AS archived, max(c.created_at) AS last_created, max(c.updated_at) AS last_updated
FROM public.group_buy_campaigns c GROUP BY 1 ORDER BY 1;

-- Q6 訂單：近 90 天新增，依來源／建立者類型彙總（actor_type 'unknown' = 無登入者且未標記 app.actor）
SELECT COALESCE(o.order_source, '(null)') AS order_source, COALESCE(l.actor_type, '(no log)') AS actor_type, COALESCE(l.source, '(no log)') AS log_source, count(*) AS orders, min(o.created_at) AS first_at, max(o.created_at) AS last_at
FROM public.orders o LEFT JOIN public.order_change_log l ON l.order_id = o.id AND l.op = 'insert'
WHERE o.created_at >= now() - interval '90 days'
GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 200;
-- Q7 訂單：import_ryoan_order_bypass／seed_app_review_account 的特徵（order_meta.import_source、order_number APLREV%、備註 App Review、order_source official_use）
SELECT o.id, o.order_number, o.accommodation_id, o.order_source, o.order_status, o.payment_status, o.final_price, o.paid_amount, o.member_id, o.created_at, o.updated_at, m.import_source, left(o.notes, 80) AS notes
FROM public.orders o LEFT JOIN public.order_meta m ON m.order_id = o.id
WHERE (o.created_at >= now() - interval '90 days' OR o.updated_at >= now() - interval '90 days') AND (m.import_source IS NOT NULL OR o.order_number LIKE 'APLREV%' OR o.notes LIKE '%App Review%' OR o.order_source = 'official_use')
ORDER BY o.updated_at DESC LIMIT 500;
-- Q8 訂單：既有訂單被「無登入者、未標記來源」改了金額／狀態（import_ryoan_order_bypass 的 ON CONFLICT 會覆寫既有訂單）
SELECT l.changed_at, l.order_number, l.accommodation_id, l.actor_type, l.actor_label, l.source, l.changed_fields
FROM public.order_change_log l
WHERE l.changed_at >= now() - interval '90 days' AND l.op = 'update' AND l.actor_type = 'unknown' AND l.source = 'unmarked'
  AND l.changed_fields::text ~ '"field": ?"(total_price|final_price|paid_amount|order_status|payment_status|member_id|accommodation_id)"'
ORDER BY l.changed_at DESC LIMIT 500;
-- Q9 團購信用卡訂單：order_source = group_buy 且非匯款，但沒有對應的已轉單 payment draft（convert 被直接呼叫的跡象）
SELECT o.id, o.order_number, o.accommodation_id, o.payment_provider, o.final_price, o.paid_amount, o.created_at
FROM public.orders o
WHERE o.created_at >= now() - interval '90 days' AND o.order_source = 'group_buy' AND COALESCE(o.payment_provider, '') <> 'manual' AND NOT EXISTS (SELECT 1 FROM public.group_buy_payment_drafts d WHERE d.converted_order_id = o.id)
ORDER BY o.created_at DESC LIMIT 200;

-- Q10 分潤：近 90 天新增，但訂單不存在、金額大於訂單總額、或訂單是 App Review／official_use
SELECT cr.id, cr.created_at, cr.accommodation_id, cr.order_id, cr.order_total, cr.commission_amount, cr.settlement_status, o.order_number, o.order_source
FROM public.commission_records cr LEFT JOIN public.orders o ON o.id = cr.order_id
WHERE cr.created_at >= now() - interval '90 days' AND (o.id IS NULL OR cr.commission_amount > COALESCE(cr.order_total, 0) OR o.order_number LIKE 'APLREV%' OR o.order_source = 'official_use')
ORDER BY cr.created_at DESC LIMIT 200;
-- Q11 會員點數：seed_app_review_account 特徵（說明含 App Review 的 admin_adjust、餘額恰為 500 的近 90 天異動）
SELECT t.created_at, t.member_id, pm.user_id, pm.email, t.type, t.amount, t.balance_after, t.description
FROM public.member_point_transactions t LEFT JOIN public.platform_members pm ON pm.id = t.member_id
WHERE t.created_at >= now() - interval '90 days' AND (t.description LIKE '%App Review%' OR (t.type = 'admin_adjust' AND t.amount = 500))
ORDER BY t.created_at DESC LIMIT 200;
SELECT mp.member_id, pm.user_id, pm.email, pm.name, mp.balance, mp.lifetime_earned, mp.updated_at
FROM public.member_points mp LEFT JOIN public.platform_members pm ON pm.id = mp.member_id
WHERE mp.updated_at >= now() - interval '90 days' AND (mp.balance = 500 OR pm.name = 'App Review 測試帳號')
ORDER BY mp.updated_at DESC LIMIT 200;

-- Q12 GBP：館別設定近 90 天變動（client_secret_configured 被改 true、連線狀態變化）
SELECT g.accommodation_id, g.connection_status, g.client_secret_configured, g.oauth_client_id, g.oauth_connected_at, g.updated_at
FROM public.accommodation_google_business_profile g
WHERE g.updated_at >= now() - interval '90 days'
ORDER BY g.updated_at DESC;
-- Q13 Vault（需要能讀 vault.secrets 的帳號；唯讀帳號若無權限請略過或改由 Dashboard 執行）：GBP 密鑰近 90 天建立／更新，以及「已設定但密鑰不見」（gbp_vault_delete 刪除的跡象）
SELECT s.name, s.created_at, s.updated_at FROM vault.secrets s WHERE s.name LIKE 'google_business_profile_%' AND (s.created_at >= now() - interval '90 days' OR s.updated_at >= now() - interval '90 days') ORDER BY s.updated_at DESC;
SELECT g.accommodation_id, g.client_secret_configured, g.connection_status, EXISTS (SELECT 1 FROM vault.secrets s WHERE s.name = 'google_business_profile_oauth_client_secret_' || g.accommodation_id::text) AS has_client_secret, EXISTS (SELECT 1 FROM vault.secrets s WHERE s.name = 'google_business_profile_refresh_token_' || g.accommodation_id::text) AS has_refresh_token
FROM public.accommodation_google_business_profile g
WHERE g.client_secret_configured OR g.connection_status = 'connected'
ORDER BY 1;

-- Q14（選用）呼叫次數：pg_stat_statements（自上次統計重置後；需有讀取權限）。userid 為執行時角色，可看出是否有 anon／authenticated 呼叫過
SELECT r.rolname, s.calls, left(s.query, 160) AS query
FROM pg_stat_statements s LEFT JOIN pg_roles r ON r.oid = s.userid
WHERE s.query ~* '(bulk_upsert_room_inventory_pricing|seed_app_review_account|import_ryoan_order_bypass|gbp_vault_delete|gbp_save_accommodation_oauth_client_secret|delete_group_buy_campaign|convert_group_buy_payment_draft|acquire_group_buy_payment_hold|consume_trip_product_stock|increment_member_push_badge)'
ORDER BY s.calls DESC LIMIT 100;
