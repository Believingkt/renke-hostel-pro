-- 影音組分潤停用後的一次性相容性校驗
-- 用途：掃描仍殘留 video 指派 / video_rate 設定 / 影音金額的異常，並附修復建議。
-- 執行方式：由具備 service role 的環境（後端查詢工具）逐段執行，僅讀取、不修改資料。
--
-- 停用基準日：2026-08-01（此日之後不應再有新的影音指派或影音金額）
--------------------------------------------------------------------------------

-- 1) 仍持有 video 角色的成員
--    建議：確認該成員是否有其他在職角色；若無，於「成員管理」停用該帳號；
--         有歷史分潤者保留角色即可（登入白名單仍允許查看歷史）。
select ur.user_id,
       p.display_name,
       array_agg(distinct ur2.role) as all_roles
from public.user_roles ur
left join public.profiles p on p.id = ur.user_id
left join public.user_roles ur2 on ur2.user_id = ur.user_id
where ur.role = 'video'
group by ur.user_id, p.display_name;

-- 2) 停用基準日之後成立、卻仍寫入 video_creator_id 的訂單
--    建議：於「成交大師 → 訂單補充資料」清空該筆的影音組指派（已改唯讀，需由 super_admin 處理）。
select om.order_id,
       o.order_number,
       o.order_date,
       om.video_creator_id
from public.order_meta om
join public.orders o on o.id = om.order_id
where om.video_creator_id is not null
  and o.order_date >= '2026-08-01'
order by o.order_date desc;

-- 3) 仍設定 video_rate > 0 的館別費率（取每館最新一筆）
--    建議：費率設定畫面已移除影音欄位，新版本會沿用舊值；
--         若要徹底歸零，可新增一筆 effective_from = 今日、video_rate = 0 的設定（append-only）。
select distinct on (accommodation_id)
       accommodation_id, effective_from, closer_rate, video_rate
from public.accommodation_commission_settings
order by accommodation_id, effective_from desc;

-- 4) 停用基準日之後的快照仍帶有影音金額
--    建議：對該期別重跑「重算未發放快照」；若期別已發放，屬歷史資料，保留即可。
select id, snapshot_month, order_id, video_creator_id, video_commission_amount
from public.closer_commission_snapshots
where coalesce(video_commission_amount, 0) <> 0
  and snapshot_month >= '2026-08'
order by snapshot_month desc;

-- 5) 停用基準日之後新增的影音補差（amount_change 類型不應再產生）
--    建議：確認來源 Edge Function 版本；amount_change 且 video_amount <> 0 屬異常，需刪除該筆調整。
select id, adjustment_month, adjustment_type, order_id, video_amount, reason
from public.closer_commission_adjustments
where coalesce(video_amount, 0) <> 0
  and adjustment_month >= '2026-08'
order by adjustment_month desc;

-- 6) 仍在生效中的 video 獎金加倍活動
--    建議：於 HQ 獎金設定刪除該筆加倍活動（新增入口已移除）。
select id, bonus_type, multiplier, start_month, end_month
from public.bonus_multiplier_settings
where bonus_type = 'video';

-- 7) 殘留的「廣告名稱 → 影音組」對照規則（管理入口已移除、自動指派已停止）
--    建議：確認無其他流程引用後刪除整表資料。
select id, keyword, video_creator_id, sort_order
from public.ad_video_creator_rules
order by sort_order;
