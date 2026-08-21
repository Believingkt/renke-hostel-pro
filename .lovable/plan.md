# 正式邀約 Tab 防呆強化 ＋ 同住夥伴（companion_cid）規則化

## 目標
1. `companion_cid` 從「選填備註」升級為有強制力的規則：分潤一律歸主檔，同行者不重複計算。
2. 折扣碼誤配（不同 KOL 撞同一 CID）在儲存前就提醒，而不是進單後才發現。
3. 補齊正式邀約表單其他容易出錯的欄位防呆。

## 現況查核（已查資料庫）
- 同碼異名共 11 組（含 `azj5273` 悌悌／鈞鈞、`chiao1115` 劉亮佐／趙小僑 這類合拍，也含 `ONI97` / `歐妮Oni`、`歐妮Ｏni` 這類純打字誤差）。打字誤差這類要從輸入端擋：KOL 名稱、IG 帳號、折扣碼三個欄位改為**可輸入的自動完成（combobox）**——邊打邊以 `ilike` 查 `kol_profiles` 歷史資料（去除大小寫／全半形差異後比對），下拉列出「姓名 ｜ IG ｜ CID ｜ 館別 ｜ 最近入住日」；選取即沿用既有寫法並可一併回填 IG／CID，堅持要打新值時顯示「查無此人，將建立新名稱」提醒，仍可繼續。
- `discount_codes` 以「碼＋館別」為單位重複是**正常設計**（`KAI555` 有 4 館各一筆），所以唯一約束必須是 `(upper(code), accommodation_id)`，不能做全域唯一。
- `discount_codes` 與 `scout_discount_codes` 撞碼 4 筆（`NORRISISAY`、`SELFE`、`SELFABBY`、`SELFNICOLE`），兩張表之間目前完全沒有互相檢查。查核撞碼對獎金發放的影響：4 筆都是**同一館別**的同碼，且都是同一個人的兩種身分寫法（3 筆 `scout_self` 自用碼＋1 筆 `partner`），所以獎金範圍**確實重疊**——`discount_codes.commission_rate` 走 KOL／夥伴分潤（`commission_records`／`order_commissions`），`scout_discount_codes` 走星探／成交獎金（`scout_discount_code_payouts`），兩條管線各自以「訂單的 discount_code 字串」為鍵、彼此不知道對方存在，同一張訂單理論上會被兩邊各抽一次。實際資料目前尚未爆掉（撞碼訂單僅 2 筆：`UE7W57F6`、`102923`，只有 1 筆 `commission_records`、`scout_discount_code_payouts` 為 0 筆），屬於未引爆的地雷而非既有錯帳。因此規則定為**擇一**：同一組（碼＋館別）只能有一種獎金來源生效，優先序為 `scout_discount_codes` > `discount_codes.commission_rate`；命中撞碼時後台該碼的獎金設定只顯示生效的那一邊，另一邊以唯讀灰階顯示「已由星探專屬碼接管，不重複計算」，並在計算端（分潤 trigger／`scout_discount_code_payouts` 產生邏輯）同步加上互斥判斷，避免只有 UI 擇一、後端仍雙算。
- `kol_profiles` 有 1 筆 `companion_cid` 指向自己；`cid_code` 有 4 組只差大小寫的變體；89 筆有 CID 但沒訂單編號。

## 一、companion_cid 規則化

資料層（migration）：
- `companion_cid` 一律存正規化大寫去空白；新增 CHECK 禁止等於自己的 `cid_code`。
- 新增 `is_companion boolean generated`（或 trigger 維護的欄位）標記「此筆為同行者，不獨立計分潤」。
- 觸發器：當 `companion_cid` 有值時，強制 `kpi_qualified = false`、`inventory_count = 0`，避免同一組住宿在 KPI／庫存被算兩次。

行為層：
- 分潤與勞報單一律歸主檔（有 `cid_code` 且 `companion_cid` 為空的那筆）。同行者列在後台顯示「分潤歸屬：<主檔姓名>」，公開查詢連結不另發，改導向主檔 token。
- 表單存檔前檢查：
  - 同住夥伴不可選自己。
  - 同住夥伴與本筆若館別／入住日期不同 → 阻擋並說明（同住必然同館同日）。
  - 若所選夥伴本身也填了同住夥伴 → 阻擋，避免鏈狀關係。

## 二、折扣碼誤配防呆（儲存前檢查）

在正式邀約 Sheet 的 CID 欄位加即時檢查（debounce），並在 `handleSave` 再做一次攔截：

| 情境 | 等級 | 提示 |
| --- | --- | --- |
| 此 CID 已被**不同姓名**的 KOL 使用，且雙方未互設同住夥伴 | 阻擋（需勾選「確認為合拍同住」才可存） | 顯示對方姓名／館別／入住日 |
| 此 CID 已被同名 KOL 於**同館別**使用 | 阻擋 | 疑似重複建檔 |
| 此 CID 只差大小寫／全半形（如 `ONI97` vs `oni97`） | 警告 | 提示是否要沿用既有寫法 |
| 此 CID 已存在於 `scout_discount_codes`（星探專屬碼） | 阻擋 | 命名空間衝突 |
| 此 CID 已存在於 PMS `discount_codes` 但綁到**別的館別** | 警告 | 提醒需在該館另建 |

資料層補強：
- `discount_codes` 加唯一索引 `(upper(trim(code)), accommodation_id)`。
- `scout_discount_codes` 加唯一索引 `(upper(trim(discount_code)), accommodation_id)`。
- 新增 `check_discount_code_conflict(_code text, _accommodation_id uuid)` security definer 函式，一次回傳兩張表的衝突結果，前端只呼叫這支。

## 三、正式邀約表單其他防呆（本輪一併補上）

1. **入住日 / 退房日**：退房日早於或等於入住日 → 阻擋；入住日早於填寫日超過 90 天 → 警告（疑似打錯年份）。
2. **訂單編號**：因有匯入（OTA／奧丁丁等）訂單，格式**不寫死、不阻擋**——僅在不符合 PMS 正式格式（8 碼英數、排除 0/O/1/I）時顯示提醒「非 PMS 正式訂單編號格式，若為匯入訂單可忽略」；填了但查無此訂單 → 警告；該訂單已被別筆邀約綁定 → 阻擋。
3. **CID 與訂單一致性**：訂單存在但其折扣碼與本筆 CID 不符 → 警告。
4. **館別**：表單的館別下拉是複合值（PMS 母館存 `accommodation_id`，自訂場域存 `venue_id`），存檔時兩個欄位可能同時有值卻指向不同館。舉例：星探先選「森山」（寫入 `accommodation_id`＝森山、並自動帶出 `venue_id`＝森山），之後改選自訂場域「雲岫 B 區」（寫入 `venue_id`＝雲岫 B 區），但舊的 `accommodation_id`＝森山沒被清掉；存檔後這筆邀約在列表顯示「雲岫 B 區」、在獎金／庫存查詢卻算到森山，兩邊對不起來也不會有任何提示。改為：存檔前檢查 `venue_id` 所屬的母館是否等於 `accommodation_id`，不一致就阻擋並提示「館別欄位不一致（顯示為雲岫 B 區、實際綁定森山），請重新選擇館別」，選擇時也一併清空另一個欄位。
5. **IG 帳號**：自動去除 `@`、完整網址前綴與 `?igsh=` 追蹤參數再存；目前只做 `trim`，導致同一人被視為兩筆。
6. **發布連結**：非 Instagram / Threads / YouTube / TikTok 網域 → 警告；有發布日但無連結 → 警告。
7. **粉絲數**：已有數值卻被改為 0 或空 → 二次確認。
8. **星探**：目前可存成空值，導致獎金無歸屬 → 改為必填（管理者可豁免）。
9. **既有 IG 重複警示**：目前只是文字提示可直接存；改為需勾選「確認為不同人／二次合作」才放行。

## 技術重點
- 前端集中到新檔 `src/lib/kolInviteValidation.ts`，回傳 `{ blocks: string[]; warnings: string[] }`，`handleSave` 統一處理；阻擋顯示紅色區塊，警告以 confirm 對話框列出。
- 唯一索引建立前先跑一次現有資料衝突清單；若既有資料違反約束，先以 `NOT VALID` 方式導入或人工清理後再加。
- 不動公開查詢頁 `kol-bonus-public` 的跨館彙總邏輯，僅調整同行者不另發 token。
