---
name: Marketing Analytics Tab
description: 營運分析 > 行銷數據分析頁籤的資料表、歸因口徑、Meta 同步排程與預算建議規則。
type: feature
---

# 行銷數據分析（/admin 營運分析 → 行銷數據分析）

## 資料表
- `meta_ad_insights_daily`：Meta 每日「廣告層級」成效（spend / impressions / reach / clicks / link_clicks / ctr / cpc / messaging_started），unique(stat_date, ad_id)。
- `order_attributions`：訂單歸因，首次接觸 + 最後點擊雙軌（first_/last_ utm_source|medium|campaign|content）、fbclid、line_source_param、ad_id、campaign_id、landing_path。unique(order_id)。前台 anon 可 INSERT，不可讀。
- `line_follow_events`：LINE OA follow / unfollow 事件與 source_param。

## 歸因口徑
- 前台 `src/lib/attribution.ts`：localStorage 存 first/last touch，30 天視窗；`captureTouch()` 由 `use-page-analytics.tsx` 每次頁面載入呼叫。
- `BookingFlow.tsx` 訂單成立後呼叫 `recordOrderAttribution(orderId, accommodationId)`（失敗不影響訂單）。
- 報表以 `last_utm_campaign`（fallback campaign_id / last_utm_source）對上 Meta `campaign_name` 做關聯。
- 取消單不計入歸因訂單與營收。

## 廣告連結規範
廣告與 LINE 導流連結必須帶：
`?utm_source=meta&utm_medium=cpc&utm_campaign=<活動名稱，需與 Meta campaign_name 相同>&utm_content=<廣告名稱>`
LINE 來源參數可用 `line_src` / `liff_src` / `oat_content`。

## 自動匯入
- Edge Function `sync-meta-ad-insights`（需 `META_ADS_ACCESS_TOKEN`、`META_ADS_AD_ACCOUNT_ID`）。
- pg_cron：`sync-meta-ad-insights-daily` 每日 19:00 UTC（台北 03:00）抓 7 天；`sync-meta-ad-insights-weekly` 週日 20:00 UTC 回補 30 天。
- 不需要 manus，數據由此排程自動匯入。

## 預算建議規則
ROAS ≥ 3 → 建議加碼；1 ≤ ROAS < 3 → 維持預算；ROAS < 1 但有訂單 → 觀察調整；無訂單且有花費 → 建議縮減。
