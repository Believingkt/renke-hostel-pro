## 技術細節（修正版：改用「價格來源」判斷，不用數字大小）

### 先回答您的三個問題

**1. room_types 有沒有可標示「靠方案定價」的欄位？有。**
`room_types.is_exclusive_package boolean NOT NULL DEFAULT false`（另有 `is_bound_to_exclusive`、`bound_exclusive_ids`）。
包棟房型的 `base_price` 就是佔位值，因此改成：**只要 `is_exclusive_package = true` 卻走到「退回 base_price」這條路，一律擋下**，不看金額。

**2. 怎麼分辨「查無庫存價」與「庫存登記 0 元」？用 COALESCE 之前的原始欄位。**
現況函式已經把原始值取進變數，可直接判斷、不需新增查詢：
- `v_inv_found`（`FOUND`）：這天在 `room_inventory_pricing` 有沒有那一列
- `v_inv_price`（`rip.price` 原值）：`IS NULL` 表示查無登記價；`= 0` 表示人為登記 0 元

判斷一律用 `v_inv_found AND v_inv_price IS NOT NULL`，不用 `COALESCE(v_inv_price, base_price) <= 0`。

**3. 收尾保險同步改寫**：不再看 `v_calculated_total <= 0`，改看「有幾晚沒取到明確價格」。

---

### 新增變數

```
v_price_source TEXT;        -- 'package' | 'inventory' | 'base' | NULL
v_unpriced_nights INT := 0; -- 取不到明確價格的晚數
```

### 第 2 項（改寫）：每晚取價，依來源判斷

取代目前 `IF v_has_pkg ... ELSIF NOT v_inv_found ... ELSE ...` 三分支：

```sql
IF v_has_pkg THEN
  -- （分級判斷 v_tier 維持原樣）
  v_tier_sale := NULLIF(v_pkg_tiers -> v_tier ->> 'sale', '')::NUMERIC;
  IF v_tier_sale IS NULL AND v_pkg_sale IS NULL THEN
    RAISE EXCEPTION '入住方案未設定 %（%）的售價，請先於方案設定填入價格',
      to_char(v_current_date,'YYYY-MM-DD'), v_tier USING ERRCODE = 'P0001';
  END IF;
  v_day_price := COALESCE(v_tier_sale, v_pkg_sale)::INT;
  v_price_source := 'package';

ELSIF v_inv_found AND v_inv_price IS NOT NULL THEN
  -- 庫存日曆有「明確登記」的價格，含人為登記的 0 元招待房 → 放行
  v_day_price := v_inv_price::INT;
  v_price_source := 'inventory';

ELSIF COALESCE(v_room_type.is_exclusive_package, false) THEN
  RAISE EXCEPTION '% 找不到有效房價：房型「%」為包棟／專案定價房型，底價僅為佔位值。請於建單時選擇對應方案，或於庫存日曆登記當日價格',
    to_char(v_current_date,'YYYY-MM-DD'), v_room_type.name USING ERRCODE = 'P0001';

ELSIF v_room_type.base_price IS NULL THEN
  RAISE EXCEPTION '% 找不到有效房價：房型「%」未設定基本房價，且當日庫存日曆無登記價格',
    to_char(v_current_date,'YYYY-MM-DD'), v_room_type.name USING ERRCODE = 'P0001';

ELSE
  -- 一般房型且底價為明確數值（含明確設定的 0）→ 放行
  v_day_price := v_room_type.base_price;
  v_price_source := 'base';
END IF;

IF v_price_source IS NULL THEN
  v_unpriced_nights := v_unpriced_nights + 1;
END IF;
```

要點：
- `base_price = 0` 但房型不是包棟 → 視為明確設定，放行（欄位可為 NULL，NULL 才是「沒設定」）。
- `is_exclusive_package = true` → 只接受方案價或庫存登記價，永遠不吃 base_price。

### 第 3 項（改寫）：收尾保險

刪除原本 `v_calculated_total <= 0 AND v_addons = 0` 的金額判斷，改為：

```sql
IF NEW.room_type_id IS NOT NULL AND v_unpriced_nights > 0 THEN
  RAISE EXCEPTION '訂單有 % 晚無法取得有效房價，已中止建單以避免寫入錯誤金額',
    v_unpriced_nights USING ERRCODE = 'P0001';
END IF;
```

這只是理論上的保險（正常情況每晚都會走到上面四個分支之一），總額為 0 但每晚都有明確來源時完全不擋。

---

### 第 4 項：KOL 免費單（原測試規劃第 6 項）的實際結果

**放行。** 判斷依據逐晚如下：

| 情境 | 原始欄位狀態 | 走到哪個分支 | 結果 |
|---|---|---|---|
| 庫存日曆登記 0 元招待房 | `v_inv_found = true`、`rip.price = 0`（不是 NULL） | `v_inv_found AND v_inv_price IS NOT NULL` | 放行，當晚房價 0 |
| 帶方案、方案價 0 | `tier_prices.sale = 0` 或 `sale_price = 0`（不是 NULL） | `v_has_pkg` 分支 | 放行 |
| 一般房型 `base_price = 0` | 欄位非 NULL | 最後 ELSE | 放行 |
| 包棟房型、無方案、庫存無登記 | `v_inv_price IS NULL` 且 `is_exclusive_package = true` | 包棟分支 | **擋下**（AT6D94S8 情境） |

因此「員工好好在庫存日曆登記 0 元招待房」不會被誤擋；被擋的只有「查無資料而退回佔位底價」。
免費單建立後 `total_price = 0`、`deposit_amount = 0`，訂金上限檢查也不會誤報。

---

### pre/postcheck

施工前後記錄 `pg_proc` 的 `prosrc` 長度與 md5、`prosecdef`、完整 ACL，
並確認 `validate_order_deposit_on_insert` 與其他 trigger 未被動到。
