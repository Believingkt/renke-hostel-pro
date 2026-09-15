---
name: OwlTing 官網信補單判斷
description: 奧丁丁「官網直訂」通知信的辨識規則與補單必要檢查，避免漏單與重複推送。
type: feature
---

# 官網信（OwlNest 直訂）補單規則

**以後任何補單／回溯重跑，都必須把「官網信」一併納入判斷，不能只處理 OTA 通路信。**

判斷要點（已實作於 `_shared/owltingHtmlParser.ts` 與 `owlting-email-ingest`）：

1. 主旨型態：官網信是「新預定／新預訂通知信」，沒有 OTA 名稱前綴，不能只比對「XX 訂單成立通知」。
2. 館別抽取：內文「`<館名>` 稍早透過 OwlNest 獲得一筆新訂單」為優先來源；不可用「OwlTing 您好」的問候語當館名（會誤判成平台名，導致 accommodation_id 為 null）。
3. 通路：官網信一律標記 `channel_source = 官網`。
4. 付款：以「總額 − 未付金額」計算已收訂金，不可預設為已付清；有尾款即 `deposit_paid`。
5. 補單後訂單需寫入 `owlting_reservation_id`；DB 觸發器 `fn_orders_owlting_enqueue` / `fn_order_rooms_owlting_enqueue` 會據此擋下回推，避免奧丁丁端出現重複訂單。
