---
name: Group Buy 銷售分析與網紅分潤口徑
description: 團購後台銷售分析 KPI／明細／匯出的唯一資料來源、分潤狀態定義與比例調整規則。
type: feature
---

# 團購銷售分析與網紅分潤

- 分潤唯一 Source of Truth = `group_buy_commissions`（建單當下快照）。**禁止**用活動目前 `commission_rate × final_price` 重算歷史訂單。
- 共用資料層 `src/lib/groupBuyAnalytics.ts`：`buildAnalyticsRows` → 畫面 KPI、明細表、Excel、PDF、列印全部吃同一份 `filtered` 陣列，確保「KPI 總額 = 明細加總 = 匯出文件」。
- 分潤狀態：`included`（訂金已確認）/`pending`（訂金未確認，尚未列入）/`cancelled`（取消 → NT$0）/`special_included`、`special_excluded`（未取消但有退款＝特例退款，需人工判定）。
- 人工判定寫入 `group_buy_commissions.manual_eligibility / manual_note / manual_set_by / manual_set_at`，並在 `group_buy_payment_events` 留下 note 稽核。
- 修改活動分潤比例會跳出確認彈窗（`GroupBuyCommissionRateDialog`）：預設「僅套用新訂單」；「同步調整未結算訂單」只影響 status=pending、未取消、未人工排除的快照，且逐筆寫稽核。
- 匯出：`src/lib/groupBuyExport.ts`（Excel 兩張工作表：摘要＋明細；PDF 橫式；列印用 `.gb-print-area` / `.gb-no-print` / `.gb-printing` CSS）。
- 方案設定頁採三段收合（基本設定／價格與適用日期／圖片與內容），元件 `GroupBuyPackageCard`，收合不 unmount 以免未存表單被重置。
- 通知設定頁顯示「目前實際收件人」與來源（活動自訂 or 民宿預設），無收件人時顯示警告。
