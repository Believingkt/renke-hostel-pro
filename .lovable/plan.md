# guard v5.7：認得「專案」定價 + 排除 bulk_open 佔位價（逐字程式碼版）

範圍二採用您核准的版本：只排除 `bulk_open`，`last_change_source IS NULL` 維持信任（歷史影響 27 筆，全部是近 90 天的 0 元佔位錯價單）。
`validate_order_deposit_on_insert` 不動。

---

## 先回答三個問題

### 1. resolve_template_night_price() 是不是照抄既有邏輯？

畫面上 NT$60,000 的來源鏈是：
`CreateOrderDialog.tsx` 第 811／1408 行 → `src/utils/templatePriceResolver.ts` 的 `resolveTemplatePricesForDates()`
→ `src/utils/templatePriceResolverPure.ts` 的 `resolveTemplatePricesFromRows()`
→ `src/utils/pricingTemplateHelpers.ts`（`hasSegments`／`findSegmentForDate`／`getTierForDate`／`isTierSellable`／`getRoomOverride`）。

**這次 SQL 版是「照著這條鏈重寫成 PL/pgSQL」，不是複用**——PL/pgSQL 沒辦法呼叫 TS。我不隱瞞這點。
六層順序就是照抄那條鏈的順序：專案覆寫價 → segments → room_overrides → 範本 tier → 單一 price → base row 餐型欄位；
日型判斷（假日／週六=weekend、週五／週日=peak、其餘=weekday）與 `classifyDayTier` 逐字對應。

保證一致的做法（不靠人眼）：新增 parity 測試 `src/utils/__tests__/templatePriceParity.test.ts`，
用正式環境現有的各型 template（segments 型／room_overrides 型／單一價型）× 一整個月每一天（含國定假日）
× 有無專案覆寫價 × 有無 base row，逐格比對 TS 與 SQL 輸出，任一格不同即失敗。
不是只驗一組 60,000；施工時這支測試必須全綠才算過。

若您希望徹底消滅雙實作，下一步可以讓前端改呼叫同一支 SQL（RPC），TS 版退成快取。但那會動到前台顯示價的主路徑，建議這次先不混在一起。

### 2. `orders.pricing_template_id` 要同步 `src/types/order.ts`

已列入施工清單第 5 項，逐字 diff 見 `docs/v57/02_frontend.diff.md` B 段。

### 3. RLS 要不要另外處理？

**不用。** Postgres 的 row-level policy 是「以整列為單位」判定，新增一個可空欄位不會改變任何既有 policy 的判定結果，也不會讓任何角色多看到或少看到任何一列。
需要注意的只有欄位級授權：`orders` 目前沒有任何 column-level GRANT（都是表層級），所以新欄位自動沿用表層級權限，不需補 GRANT。
新的 `resolve_template_night_price()` 是 SECURITY DEFINER，依既有規則在同一個 migration、同一交易內 `CREATE` ＋ `REVOKE ALL FROM PUBLIC/anon/authenticated` ＋ `GRANT` ＋ 權限 postcheck。

---

## 逐字程式碼

- `docs/v57/01_hunks.sql`
  - (1) `ALTER TABLE public.orders ADD COLUMN pricing_template_id`
  - (2) `resolve_template_night_price()` **全文**＋REVOKE/GRANT/postcheck
  - (3) `validate_order_before_insert()` 的三段逐字置換（HUNK A 宣告、HUNK B 庫存來源、HUNK C 每晚取價分支），old → new 全部列出
- `docs/v57/02_frontend.diff.md`：`CreateOrderDialog.tsx`、`src/types/order.ts`、parity 測試

### 關於 validate_order_before_insert 為何用「置換」而不是重打全文

該函式現有 358 行，其中約 300 行是加購重算、庫存／人數／間數檢查、折扣與收尾，本次一字不動。
施工時 migration 會**以資料庫目前的 `prosrc` 為基底**，程式化套用上述三段置換後再 `CREATE OR REPLACE`，
避免人工重打造成看不見的漂移；未改動區塊會用 md5 比對確認逐字相同。
您要審的「所有會變的字」，`01_hunks.sql` 已 100% 列出。若您仍要看拼好的 358 行全文，我可以在您接受草稿前先產出來給您看，不進資料庫。

---

## 施工項目清單

1. migration：`orders.pricing_template_id`（可空、FK、ON DELETE SET NULL）
2. migration：`resolve_template_night_price()`（SECURITY DEFINER ＋ 同交易 REVOKE/GRANT/postcheck）
3. migration：`validate_order_before_insert()` 三段置換
4. 前端：`CreateOrderDialog.tsx` payload 帶 `pricing_template_id`
5. 前端：`src/types/order.ts` 補欄位
6. 測試：`templatePriceParity.test.ts`（TS ↔ SQL 逐格比對）
7. pre/postcheck：兩支函式的長度／md5／prosecdef／完整 ACL、trigger 清單、未改動區塊 md5

## 測試計畫（全部 BEGIN…ROLLBACK）

1. 哈庫納 line ＋ 20人包棟 ＋「20人一泊二食」專案 → 60,000（不再 0、不再跳訂金錯誤）
2. 同房型改週五、週六、週日、國定假日各一組 → 與前端顯示逐格相同
3. 該日有專案覆寫價（`pricing_template_id` 非空的庫存列）→ 取覆寫價
4. segments 型專案：日期落在段內／段外各一組 → 段外應 fallback 或擋下
5. room_overrides 型專案：override 覆寫 tier 價、override 關閉該 tier 各一組
6. package 路徑既有案例 → 金額與現況一字不差（零 diff）
7. 庫存 `manual_edit` 登記 0 元招待房 → 放行，房價 0
8. 包棟房型、無方案無專案、只有 `bulk_open` 0 元 → 擋下並貼中文訊息全文
9. 一般房型 `base_price` 有值、只有 `bulk_open` → 走 base_price 放行
10. `last_change_source IS NULL` 的舊登記價 → 維持放行（566 筆那類不受影響）
11. 豁免來源（manual／owlting／hotelnabe／group_buy）→ 完全不進重算
12. parity 測試矩陣全綠

核准後才動資料庫。
