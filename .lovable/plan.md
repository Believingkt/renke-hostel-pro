# 加購金額驗證 / 訂金 trigger 順序 / 歷史資料 — 查證與設計（未施工）

## 一、加購金額驗證缺口

### 現況（`validate_order_before_insert()`）
```sql
v_addons := COALESCE(NEW.pet_plan_price,0)::INT + COALESCE(NEW.meal_plan_total,0)::INT;
IF NEW.custom_addon_details ... 'array' THEN
  FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.custom_addon_details) LOOP
    v_addons := v_addons + COALESCE((v_item->>'total')::NUMERIC,0)::INT;
  END LOOP;
END IF;
...
v_calculated_total := (v_room_only_total * v_qty) + v_addons;
```
房價逐日回查 `room_inventory_pricing` / `accommodation_packages.tier_prices` 重算，加購則**完全信任 payload 的 total**。

### 定價設定資料表
1. `addon_settings`：`accommodation_id, addon_type, price_per_unit, pricing_mode('per_night'|'per_stay'), min_quantity, max_quantity, weekday_min_quantity, weekend_min_quantity, enabled, is_locked, auto_include`。目前 31 種 addon_type、全為單一 `price_per_unit`，**無逐日價、無淡旺季**。
2. `trip_products`：`id, accommodation_id, price, stock, is_active`（行程加購走 `source:'trip_product'`、`product_id`）。
3. `orders.pet_plan_price`：舊欄位，前端 `BookingFlow.tsx:3050` 以 `petCount × pricePerUnit × nights` 算出，來源仍是 `addon_settings` 的寵物項目。
4. `orders.meal_plan_total`：已停用（`AddonPlansSection.tsx:518` 註記；全庫 website 訂單 0 筆非 0）。

### 重算可行性
可行，且比房價簡單（無逐日價）。建議公式：

| 來源 | 判定 | 重算 |
| --- | --- | --- |
| `addon_id` 命中 `addon_settings`（且 `accommodation_id` 相符、`enabled`） | 正常 | `price_per_unit × count × (pricing_mode='per_night' ? nights : 1)` |
| `source='trip_product'` + `product_id` 命中 `trip_products`（`is_active`） | 正常 | `price × count`（per_stay） |
| 無 `addon_id`、僅名稱 | 以 `addon_type` 對 `accommodation_id` 內名稱唯一命中才採用 | 同上 |
| 完全命中不到 | 視為 0（不採信 payload） | 0 |

同時可覆寫每筆 `total`、`price_per_unit`，讓明細與金額一致；並可加上 `count` 落在 `min_quantity..max_quantity` 的檢查。

複雜度：中低。單一 `SELECT ... FROM jsonb_array_elements LEFT JOIN addon_settings/trip_products` 即可完成，約 40–60 行。

風險點（需在設計核准前確認）：
- 命中不到就歸 0，會讓「後台改名 / 停用過的舊項目」在新訂單被歸零 → 建議先跑一次全庫比對，統計 payload total 與重算值的差異筆數再決定嚴格度。
- `pet_plan_price` 名稱對應多筆寵物項目（大型 / 中小型 / 小型 / 寵物方案 / 寵物友善方案），無 `addon_id` 可對，重算基礎不可靠 → 建議此欄位維持「不重算、只檢查 ≥ 0」，或先在前端改走 `custom_addon_details`。
- `meal_plan_total` 已停用，建議一律強制為 0。

## 二、訂金驗證 trigger 順序

### `trg_validate_order_deposit_on_insert` 完整 definition
```sql
CREATE TRIGGER trg_validate_order_deposit_on_insert
BEFORE INSERT ON public.orders FOR EACH ROW
EXECUTE FUNCTION validate_order_deposit_on_insert();

CREATE OR REPLACE FUNCTION public.validate_order_deposit_on_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE half_final NUMERIC;
BEGIN
  IF current_setting('app.bypass_inventory_check', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.deposit_amount,0) > 0 THEN
    half_final := FLOOR(COALESCE(NEW.final_price,0) / 2);
    IF NEW.deposit_amount > half_final THEN
      RAISE EXCEPTION '訂金金額 (%) 必須小於或等於尾款（上限 %）', NEW.deposit_amount, half_final
        USING ERRCODE='check_violation';
    END IF;
    IF COALESCE(NEW.balance_payment_method, NEW.payment_method,'') <> 'bank_transfer'
       AND NEW.payment_status='deposit_paid' THEN
      RAISE EXCEPTION '只有「匯款」付款方式可使用訂金 / 尾款拆分' USING ERRCODE='check_violation';
    END IF;
  END IF;
  IF NEW.payment_status='paid' THEN
    NEW.deposit_amount := 0;
    IF COALESCE(NEW.paid_amount,0) < COALESCE(NEW.final_price,0) THEN
      NEW.paid_amount := NEW.final_price;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
```
**檢查的是「payload 帶進來的 final_price」**：BEFORE INSERT trigger 依名稱字母序執行，`trg_validate_order_deposit_on_insert` < `validate_order_before_insert_trigger`，所以訂金上限與 `paid_amount` 補值都發生在房價重算之前。

### 改名方向與風險
`ALTER TRIGGER trg_validate_order_deposit_on_insert ON public.orders RENAME TO zzz_validate_order_deposit_on_insert;`

- 改名只改 `pg_trigger.tgname`，不影響函式本體、不影響 RLS、不影響 `order_change_log`。
- 全 repo 只有 migration `20260518102021` 提到這個名字（DROP/CREATE），沒有任何應用程式碼依賴。
- 真正的風險在**執行順序連帶變動**：改成 `zzz_` 後，它會排在目前所有 BEFORE INSERT trigger 之後，也就是同時晚於
  `trg_sync_order_payment_fields`、`trg_orders_website_inventory_gate`、`trg_orders_prevent_double_submit`、`validate_order_before_insert`(validate_order_insert)。需要確認：
  1. `sync_order_payment_fields` 是否會改動 `payment_status` / `payment_method` / `deposit_amount`，導致訂金檢查判定改變；
  2. `paid_amount := final_price` 這段在重算後補值是否為期望行為（多半是，但金額會變成重算值）；
  3. 既有走公開表單且 `deposit_amount > 0` 的訂單，重算後 `final_price` 若低於 payload，可能從「原本通過」變成「被擋」。
- 影響面小於重寫函式，但屬於行為變更，建議與加購重算同一維護窗，並先跑 BEGIN...ROLLBACK 對照測試。

## 三、歷史資料查證（website 來源）

全庫 `order_source='website'` 共 **39 筆**：
- 無任何加購：28 筆
- `pet_plan_price > 0`：2 筆
- `custom_addon_details` 非空：9 筆
- `meal_plan_total > 0`：**0 筆**（欄位已停用）

逐筆檢視 11 筆有加購的訂單，明細都帶有 `addon_id` / `product_id`、`price_per_unit`、`count`，且 `total = price_per_unit × count`（per_night 項目另乘晚數）：
- `RA5L63G6`：加床服務 800×3、大型寵物 1000×1 → 與 `addon_settings` 現價一致。
- 沙洲 `加床 1500×2`、`寵物友善方案 800×2` → 一致。
- `TE5A57U6` / `BJ3S55J8`：行程商品，其中「伊達邵親水步道」`price_per_unit = 0`、`total = 0`，對照 `trip_products` 該商品本身即免費，非異常。
- `SK4Z76U9`：「2-6歲幼童含早 500×1」，備註「多加收500元…已算進訂單金額」，與 `total_price 4500 = 房費 4000 + 500` 相符。

「零加購但備註疑似有加購」的樣本，逐筆看都不是公開表單原生訂單：多為奧丁丁 / 現場訂房後以【來源變更】改為官網訂房、或包區房間配置備註，金額另以【金額修改】人工調整。

**結論：目前查不到公開表單路徑下「加購金額被壓低或歸零」的實際案例。** 缺口屬理論可利用，尚無歷史利用跡象。

## 四、建議處理順序（待裁示）
1. 先做加購重算（覆蓋面最大、無行為回歸風險，除了「命中不到歸 0」需先跑全庫差異統計）。
2. 再做訂金 trigger 改名（行為變更，需對照測試）。
3. `meal_plan_total` 一併強制 0、`pet_plan_price` 是否改走 `custom_addon_details` 另議。

未施工。等待明確核准。
