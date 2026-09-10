## 技術細節

改動位置：`validate_order_before_insert()` 的每晚迴圈（目前的取價分支）與迴圈後收尾。

現況取價順序（有房型時）：
1. 有方案且有售價 → 依平日／週五日／假日分級取方案價
2. 無方案且當日沒有庫存資料 → `room_types.base_price`
3. 無方案但有庫存資料 → `COALESCE(庫存價, base_price)`

問題：包棟房型 `base_price = 0`、當日庫存價也是 0 或無 → `v_day_price = 0`，整單算成 0。

### 新增檢查（三處）

1. **有 `package_id` 但取不到售價**（`v_pkg_sale` 與 tier 皆 NULL）
   `RAISE EXCEPTION '入住方案未設定 %（%）的售價，請先於方案設定填入價格', 日期, tier`

2. **每晚取價結果 `IS NULL 或 <= 0`**（含無方案的包棟情境）
   ```
   RAISE EXCEPTION '% 找不到有效房價（房型「%」未設定基本房價，且當日無庫存價）。
                    此房型的價格設定在專案方案中，請於建單時選擇對應方案。',
     to_char(v_current_date,'YYYY-MM-DD'), v_room_type.name
     USING ERRCODE = 'P0001';
   ```

3. **收尾保險**：`v_calculated_total <= 0 且 v_addons = 0 且 room_type_id IS NOT NULL`
   → `RAISE EXCEPTION '訂單金額計算結果為 0，已中止建單以避免寫入錯誤金額'`

### 刻意不擋的情形
- 互惠／公務免費單（KOL、公務使用）目前有 314 筆總額 0，屬正常使用。
  → 因此檢查條件加上「**未帶折扣、且訂金或已收金額 > 0 才視為異常**」的判斷？
  **本設計採取相反做法**：檢查只針對「每晚房價取不到」的情形，
  免費單若確實要建立 0 元訂單，必須帶方案或在房型／庫存日曆設 0 價（明示 0，而非查無資料）。
  這點需要您確認：是否接受免費單改為「必須明確設定 0 元」。

- `app.bypass_inventory_check = on`（既有測試／匯入旁路）維持不受影響。
- 豁免來源（manual／owlting／hotelnabe／group_buy）完全不進入這段邏輯。

### 測試規劃（全部 BEGIN…ROLLBACK）
1. line + 包棟房型 + 無方案 → 應被擋下，錯誤訊息含日期與房型名
2. line + 包棟房型 + 正確方案 → 建單成功，金額＝方案分級價
3. owner_provided + 包棟無方案（重現 AT6D94S8）→ 應被擋下
4. manual 來源同樣情境 → 不受影響，維持沿用前端金額
5. 一般散客房型（有 base_price）→ 不受影響
6. KOL 免費單現況 → 確認是否被新檢查擋下（依上述待確認項調整）
7. `bypass_inventory_check` 旁路 → 不受影響

### pre/postcheck
施工前後記錄 `pg_proc` 的 `prosrc` 長度與 md5、`prosecdef`、完整 ACL，
並確認 `validate_order_deposit_on_insert` 與其他 trigger 未被動到。
