# 建單房價 guard v5.7：認得「專案」定價 + 分辨庫存日曆真假登記

不動 `validate_order_deposit_on_insert`（訂金上限檢查維持現狀）。只改房價計算本身。

---

## 先報告一個必須先解決的技術前提

「專案」(`pricing_templates`) 選擇目前只存在 `order_rooms.template_id`，而 `order_rooms` 是**訂單建立成功之後**才寫入的（`CreateOrderDialog` 第 1589 行先 insert `orders`，第 1617 行才 insert `order_rooms`）。
guard 跑在 `orders` 的 BEFORE INSERT，當下資料庫**看不到任何 template_id**，`orders` 也沒有任何欄位存專案。

所以「讓 guard 認得專案」無法只靠改函式，必須多一條資料通道。建議做法（最小、可回溯相容）：

- 新增可為空的欄位 `orders.pricing_template_id uuid`（參照 `pricing_templates`）。
- `CreateOrderDialog` 建單時把主房型那筆 `roomSelections[0].template_id` 一併寫入（與現有 header 欄位 `room_type_id`／`room_quantity` 同層級的做法一致）。
- 欄位為 NULL 時，guard 行為與現在**完全相同**（既有訂單、OTA、團購、匯入路徑零 diff）。

其他方案（連線層 `set_config`、把驗證延到 `order_rooms` 寫入後）都需要改交易結構或新增延遲檢查，風險比新增一個可空欄位高，不建議。

---

## 範圍一：guard 讀得到專案價格

在現行「每晚取價」四分支之前，插入一條新分支，取價優先序變成：

1. `package_id` 有值 → 現行 package tier 邏輯（**完全不動**）
2. `pricing_template_id` 有值 → 新的專案取價（見下）
3. 庫存日曆「真登記」價格
4. 房型 `base_price`（非包棟房型）
5. 都沒有 → 擋下，中文訊息

### 專案取價（新增 helper 函式 `public.resolve_template_night_price`）

輸入：template_id、room_type_id、日期、accommodation_id；回傳該晚房價或 NULL。依序：

1. `room_inventory_pricing` 中 `pricing_template_id = 該專案` 的當日覆寫價（存在即採用，含 0）
2. `season_segments` 有設定 → 取該日期區間對應 tier 的價格，該 tier 未啟用則回 NULL
3. `room_overrides` 內該房型的 tier 價格
4. 專案本身的 `weekday_price` / `peak_price` / `weekend_price`（對應 `*_enabled` 為 false 者不採用）
5. `price`（單一價）
6. 以上皆無 → NULL（交回主流程往下一層 fallback）

**tier 判斷共用**：現有 package 區塊已算出 `v_tier`（假日或週六 = `weekend`；週五、週日 = `friday_sunday`；其餘 = `weekday`），與 pricing template 的三段制定義相同。設計上把這段 tier 判斷抽到迴圈開頭統一計算一次，package 分支沿用原變數與原字串（`friday_sunday`），template 分支把它映射為 `peak`。**package 分支的取價結果零 diff**。

---

## 範圍二：分辨庫存日曆的真登記 / 假登記

沒有 package、也沒有 template 時，`room_inventory_pricing` 的價格改為依 `last_change_source` 判斷：

- 視為有效（不論金額，含 0）：`template_apply`、`owlting_rate`、`manual_edit`、`system_repair`、`one_click_sync`、`revert_manual_restore`
- 視為無效（當成查無資料，往下 fallback，包棟房型即擋下）：`bulk_open`

`last_change_source IS NULL`（舊資料）如何處理，見下方掃描結果，需要您裁決。

擋下時的訊息沿用已核准措辭（包棟／方案定價房型一句、未設定基本房價一句）。

---

## 歷史影響掃描（已實際跑過，唯讀）

母體：非豁免來源、`package_id IS NULL`、有房型的訂單，共 **3,817 筆**。判斷「若照新邏輯重跑會不會被擋」＝ 該訂單有任一晚是靠不受信任來源的登記價，且房型是包棟或 `base_price` 為 NULL。

| 方案 | 受影響（曾靠該來源建單） | 會從成功變成被擋 |
|---|---|---|
| 只把 `bulk_open` 視為無效（NULL 仍信任） | 27 筆 | **27 筆** |
| `bulk_open` + `last_change_source IS NULL` 都視為無效 | 606 筆 | **566 筆** |

補充數據：
- 那 27 筆全部是近 90 天內、且全部是 `bulk_open` 且 price = 0 的佔位值，正是 AZ4E83W4／JV9F42D6 這一類（含多筆 `total_price = 0`、`final_price = 0` 的錯價單），也包含幾筆事後被人工改回正確金額的（例：XM2N98Y7、QG2B43W7）。
- 566 筆那組，絕大多數是 `last_change_source IS NULL` 的舊資料（天送幸福和苑、森山寫照、淞湘卉館、哈庫納等包棟房型，2026-03 起至今），庫存價格總表中 NULL 來源就有 10,102 列。

### 建議

**只把 `bulk_open` 視為無效，`NULL` 維持信任。** 理由：NULL 是欄位加上去以前的舊資料，來源不明但實際被正常訂單長期採用，一律不信任會誤傷 566 筆的同類日常建單；而 `bulk_open` 是明確可辨識的「只是開放房量」佔位，正是本次 bug 的來源。這需要您確認後才寫入設計定案。

---

## 不受影響（要求零 diff 的兩條路）

- `package_id` 路徑：分支順位第一、邏輯逐字不動，只是 tier 判斷從分支內移到迴圈開頭（同樣的計算、同樣的變數值）。
- 庫存日曆真登記路徑：條件由 `v_inv_found AND v_inv_price IS NOT NULL` 變成再加一個來源白名單；白名單涵蓋除 `bulk_open` 外全部既有來源值，故既有真登記訂單行為不變。
- 豁免來源（`manual`／`owlting`／`hotelnabe`／`group_buy`）、加購重算、庫存/人數/間數檢查、折扣計算、`validate_order_deposit_on_insert`：全部不動。

## 施工項目清單

1. migration：新增 `orders.pricing_template_id`（可空）
2. migration：新增 `public.resolve_template_night_price()`（SECURITY DEFINER，`CREATE`＋`REVOKE ALL FROM PUBLIC, anon, authenticated`＋grant＋權限 postcheck 同一交易）
3. migration：`CREATE OR REPLACE public.validate_order_before_insert()`（範圍一＋範圍二，同一次改完）
4. 前端 `CreateOrderDialog.tsx`：建單 payload 帶入 `pricing_template_id`
5. pre/postcheck：三個函式的長度／md5／prosecdef／完整 ACL，trigger 清單不變

## 測試計畫（全部 BEGIN…ROLLBACK）

1. 哈庫納 line＋20人包棟＋「20人一泊二食」專案 → 應算出 60,000（不再是 0、不再跳訂金錯誤）
2. 同上但改假日日期 → 取到假日 tier 價
3. 專案有當日 `pricing_template_id` 覆寫價 → 取覆寫價
4. package 路徑既有案例（SR7N27N4／UR8N57Q2 同型）→ 金額與現況一字不差
5. 庫存日曆 `manual_edit` 登記 0 元招待房 → 放行，房價 0
6. 包棟房型、無 package、無 template、只有 `bulk_open` 0 元 → 擋下並回中文訊息全文
7. 一般房型 `base_price` 有值、只有 `bulk_open` → 走 base_price 放行
8. 豁免來源（manual）→ 完全不進重算

設計稿確認後才動資料庫。
