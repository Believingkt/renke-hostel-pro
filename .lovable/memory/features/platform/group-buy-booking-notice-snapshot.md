---
name: Group Buy 訂房須知快照
description: 團購訂單下單當下的訂房須知/入住前提醒快照機制、讀取優先序與相容規則。
type: feature
---

# 團購訂房須知快照（Booking Notice Snapshot）

- 欄位：`orders.group_buy_booking_notice_snapshot` (jsonb)，**只在 `group-buy-create-order` 建單時寫入一次**，之後永不回寫、不補寫。
- 結構：`{ version, captured_at, campaign_id, accommodation_id, visible_keys, sections[], post_booking_notice }`。
  `sections` 是「下單當下依 campaign.booking_notice_keys 實際會看到的內容」，self-contained（title/subtitle/textRows/html）。
  `post_booking_notice`（入住前提醒，來自 `group_buy_venue_intros.check_in_notice`）與訂房須知**分開保存**。
- 共用組裝邏輯：`src/lib/bookingNoticePanels.ts`（前端）／`supabase/functions/_shared/bookingNoticePanels.ts`（Deno 複本），兩份需同步。
- 讀取優先序：快照 → 無快照才 fallback live data。舊訂單無快照時，訂單查詢頁顯示「以上為目前最新的訂房須知」。
- 活動封存／刪除、訂單取消退款皆不影響快照顯示（快照存在 orders，不依賴 campaign）。
- `BookingInfoSection` 與 `GroupBuyBookingInfoCompact` 均支援 `sections` prop 直接渲染快照。
- 後台 `/admin/group-buy` 稽核紀錄視窗可查看「下單當時訂房須知」。
- 確認信 Email 只列訂單／匯款資訊，不含訂房須知全文，因此不需帶快照；如日後要放全文，須改讀快照而非 live data。

## 客人前台禁止暴露技術資訊（固定規範）
- 客人可見頁面（團購頁、下單完成頁、訂單查詢／匯款回報／取消申請、客人 Email）一律不得出現程式碼、JSON、
  raw metadata、API/Edge Function/Supabase/SQL 原始錯誤、stack trace、內部欄位或 table/column 名稱、UUID、
  campaign_id/accommodation_id/order_id 等內部 ID、storage path、debug 或 console 資訊。
- 一律經 `src/lib/guestFacingError.ts` 的 `toGuestMessage()` 轉譯後才顯示；只有含中文且無技術特徵的業務訊息可原樣顯示。
- Edge Function catch-all 只回傳友善中文，原始 exception 留 server log；DB/trigger error 不得回傳給客人。
- 訂房須知快照只以 `bookingNoticeSections`（純渲染面板）回傳，version / captured_at / visible_keys /
  campaign_id / accommodation_id 一律不出客。
- 快照建立失敗：server log + `group_buy_payment_events.event_type = 'booking_notice_snapshot_failed'`；
  後台顯示「此訂單缺少下單時訂房須知快照」，客人端無任何提示。
- `ChunkErrorBoundary` 的原始錯誤訊息只在 /admin /hq /team /ai-training 或 DEV 顯示。
