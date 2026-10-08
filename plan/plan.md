# D2 裂變 — 館別 gate（3-b）施工計畫 ＋ 艾玹爾資料準備指南 ＋ 測試清除 SQL

本批只改 `referral-hook`（qualify），加入「活動綁館別時，訂單館別需相符才發獎」。另附你要的艾玹爾可下單最小設定、隱藏館訂房網址、以及測完清資料的 SQL。不 push、不 Publish、不印任何 key。

## 誰會用到
總部（/hq/referral）設定裂變活動；一般會員在 /member/referral 拿連結、受邀者經 /r/:code 註冊並下單。

---

## 一、要改什麼（referral-hook qualify 的館別 gate）

### 現行「首筆」是怎麼認定的（先講清楚）
- `qualify(member_id, order_id)` 由 `BookingFlow` 在**訂單建立後**呼叫（每次下單都會呼叫一次）。
- 它找「`invitee_id = 受邀會員` 且 `status ∈ (registered, clicked, pending)`」最早的一列當作該受邀者的裂變關係；找到就發 tier1（給直接邀請人）、再找上一層發 tier2。
- 一旦該列被標成 `rewarded`／`qualified`，之後的訂單就不再匹配 → 所以現況等於「受邀者**全平台第一筆**訂單」就觸發，**完全不看訂單是哪一館**。

### 改成「該活動適用館別的首筆」
在 qualify 開頭加一道館別判斷：
1. 讀活動 `referral_campaigns.accommodation_id`。
2. 若為 NULL（全平台活動）→ 行為完全不變（維持現況）。
3. 若有值（綁定某館，例：艾玹爾）→ 用 `order_id` 去查 `orders.accommodation_id`：
   - **相符** → 照常發 tier1＋tier2、把邀請列標成 rewarded（同現行）。
   - **不相符**（或查不到該訂單）→ **不發獎、不寫任何點數、不新增 tier2 列、不更動邀請列狀態**（維持 `registered`），回傳 `skipped: "accommodation_mismatch"`。
4. 因為不相符時邀請列維持 `registered`，受邀者**之後在正確館別的下一筆訂單**仍會再次觸發 qualify 並正常發獎。

### 新「首筆」語意與影響（建議採此定義）
- 定義：**受邀者在「活動綁定館別」的第一筆成立訂單**才發獎。
- 影響：
  - 受邀者若先在別館下單，不會「用掉」這個裂變關係，也不會誤發獎；要等他訂到活動指定館別才發。
  - 隱藏測試館因此能真正隔離：真實會員就算拿到連結、在別館下單，也不會領到測試活動的點數（補上你原本擔心的漏洞）。
  - tier1、tier2 一起套用同一道館別判斷（不相符時兩層都不發）。
  - 已發過獎的列不會二次觸發（狀態已非 registered），無重複發獎風險。
- 全平台活動（accommodation_id 為 NULL）完全不受影響。

### 改動範圍
- 只動 `supabase/functions/remarketing-send`？否 —— 本批只動 **`supabase/functions/referral-hook/index.ts`**。
- 不需要 migration（`orders.accommodation_id`、`referral_campaigns.accommodation_id` 皆已存在）。
- 不改 `BookingFlow`、不改共用 `referral.ts`（qualify 已帶 order_id，館別在後端查，前端零改動）。
- `get_link` 挑選 active 活動的邏輯不動。
- 6 的 `is_test` 不做。

### 驗收方式（部署後）
- A→B→C：C 在艾玹爾下單 → B 得 500、A 得 100（member_points / member_point_transactions 有入帳、referral_records 兩列 rewarded）。
- 反向驗證：任一受邀者在別館下單 → qualify 回 `accommodation_mismatch`、無點數、邀請列仍 registered。

---

## 二、艾玹爾要能被下單，最少要設定什麼（你方在館別後台操作）

前台訂房是「**方案制**」：下單時訂單會寫入 `package_id`，所以除了房型與房價，**必須有一個啟用中的訂房方案且該日期有價格**，前台才會出現可訂選項。最小清單：

1. **房型**（後台：房型設施 →「房型與房間照片」，路徑 `/admin/pricing?tab=rooms`）
   - 新增 1 個房型：填**名稱**、**可住人數（capacity > 0）**。
   - 上傳**至少 1 張房型照片**（上架引導第 4 步要求；也讓卡片有圖）。
2. **房價綁定房型**（後台：房價庫存 →「房價設定」，路徑 `/admin/projects`）
   - 建立房價並綁到上面的房型。
3. **開放庫存＋逐日房價**（後台：房價庫存 →「房況日曆」，路徑 `/admin/room-price-calendar`）
   - 把測試要用的那幾天設成**可訂（available_rooms > 0）**並**填入房價**。
   - 這也是下單時的庫存閘門來源，沒開放會擋單（inventory_unavailable）。
4. **訂房方案**（後台：房價庫存 →「訂房方案」，路徑 `/admin/packages`）
   - 建立並**啟用**至少一個方案，關聯到該房型。
5. **方案逐日價格**（後台：房價庫存 →「前台訂房價格日曆」，路徑 `/admin/package-price-calendar`）
   - 把測試那幾天的方案**售價**標好（> 0）。
6. **付款方式**（後台：官網內容 →「訂房資訊」付款方式，路徑 `/admin/website-content?tab=booking-info`）
   - **開啟「ATM 虛擬帳號」**即可（見下一節，ATM 不需刷卡就能觸發發獎）。

> 上架引導頁（`/admin/onboarding`）可即時看到第 4/5/6/7/8/9/10 步是否變綠，綠了代表前台可訂的條件到位。

### ATM 是否需要額外設定、能不能免刷卡觸發獎勵
- **可以免刷卡。** 前台選 **ATM 虛擬帳號** 送出時，系統**先把訂單建立起來**（`payment_status = pending_payment`、`order_status = pending`），而 `qualifyReferral` 就在「訂單建立後」立刻呼叫——**不等真的匯款**。所以 C 只要把訂房表單填完、選 ATM、送出，就會觸發發獎，**不需要真的去繳款、也不需後台改成已付款**。
- ATM 本身不需要你額外接金流設定，只要在付款方式把它打開即可。
- （備註：目前「建單即發獎、未付款也發」是現況行為；你已決定這批不改、結案審查後再評估改到付款成功。這裡只是說明為何 ATM 對測試最省事。）

### 隱藏館的前台訂房頁網址格式
- 館別專屬訂房頁（用館別的 alias 網址代稱）：`https://booking.lakeze.com/{alias}`
- 或用館別 ID 直達：`https://booking.lakeze.com/booking/villa/{accommodation_id}`
- 單一房型深連結（E2 卡片用的格式）：`https://booking.lakeze.com/book?accId={accommodation_id}&roomId={room_type_id}`
- 這些「直接網址」即使館別沒有列在平台入口（隱藏）也能開啟，A→B→C 流程照常走。
  - ⚠️ 但請先用上面網址**實際開一次、確認能進到下單頁**再跑測試：若館別有「未上架/停用」之類的旗標會擋住訂房頁，需要先讓該館處於可訂狀態（可訂但不列在入口＝隱藏測試館的目標）。

---

## 三、測試完清除資料的 SQL（你在 Supabase Dashboard 執行）

前提：獎勵型別是 points（你設定 tier1=500、tier2=100），不涉及 coupon 表。把下面的 `<CAMPAIGN_ID>` 與三個測試會員 email 換成實際值。

```sql
-- 0) 找出示範活動與其綁定館別（確認無誤再往下）
select id, name, accommodation_id, is_active
from public.referral_campaigns
where name = '你的示範活動名稱';   -- 取得 <CAMPAIGN_ID>

-- 1) 預覽本活動的裂變紀錄（確認都是測試資料）
select id, tier, status, inviter_id, invitee_id, reward_value, invitee_order_id, created_at
from public.referral_records
where campaign_id = '<CAMPAIGN_ID>'
order by created_at;

-- 2) 回沖測試會員的裂變點數交易
with test_members as (
  select id from public.platform_members
  where email in ('A@example.test','B@example.test','C@example.test')
)
delete from public.member_point_transactions
where member_id in (select id from test_members)
  and description = '社群裂變推廣獎勵';

-- 3) 重算這三位測試會員的點數餘額（依其剩餘交易重新加總）
update public.member_points mp
   set balance = coalesce(s.bal, 0),
       lifetime_earned = coalesce(s.earned, 0)
from (
  select member_id,
         sum(amount) as bal,
         sum(case when amount > 0 then amount else 0 end) as earned
  from public.member_point_transactions
  group by member_id
) s
where mp.member_id = s.member_id
  and mp.member_id in (
    select id from public.platform_members
    where email in ('A@example.test','B@example.test','C@example.test')
  );

-- 3b) 若這三位是純測試帳號、除了裂變沒有任何其他點數，
--     也可直接刪掉 member_points 列（擇一，不要和 3) 併用）：
-- delete from public.member_points
-- where member_id in (
--   select id from public.platform_members
--   where email in ('A@example.test','B@example.test','C@example.test')
-- );

-- 4) 刪除本活動的所有裂變紀錄（含 tier1 / tier2）
delete from public.referral_records
where campaign_id = '<CAMPAIGN_ID>';

-- 5)（可選）刪除示範活動本身
-- delete from public.referral_campaigns where id = '<CAMPAIGN_ID>';
```

注意：
- `member_point_transactions.balance_after` 是當時的快照欄位；步驟 3 的重算只更新 `member_points` 的目前餘額。若你想連歷史交易的 `balance_after` 都乾淨，用 3b 直接刪 `member_points` 列、並確保 3) 已刪掉交易即可（測試帳號建議用 3b 最乾淨）。
- 測試用 ATM 建立的 C 訂單若也想清，可另外 `delete from public.orders where id = '<C 的 order_id>'`（確認沒有被其他表外鍵參照；一般測試單可直接刪）。

---

## 施工階段
- 階段 1（本批）：referral-hook qualify 館別 gate（上述）；本機 build 驗證後回報 git status / diff / changed-edge-functions 清單，等你確認，不部署。
- 階段 2（結案審查後再議）：把發獎時點由「建單」改到「付款成功」。
- 階段 3（可選）：referral is_test 欄位，讓統計可排除測試而不必刪資料。

## 假設（未問你、我逕自決定的）
- 「首筆」採「活動綁定館別的首筆」（你也傾向此定義）。
- 訂單查不到或 order_id 缺漏且活動綁館別時，從嚴判為不相符 → 不發獎、維持 registered。
- 不相符時完全不更動邀請列狀態（維持 registered），讓之後正確館別的訂單可再觸發。
- 獎勵型別為 points（依你 500/100 設定），清除 SQL 不含 coupon 表。
