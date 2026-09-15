# v5.7 前端逐字異動（設計稿，未施工）

## A. `src/components/orders/CreateOrderDialog.tsx`（第 1589 行附近，orders insert payload）

```diff
         package_id: effectivePackageId,
+        // v5.7：把「專案」帶到 orders header，讓 validate_order_before_insert 能重算房價。
+        // 多房型時以主房（第一筆）為準，與 room_type_id / room_quantity 同一層級的既有做法一致。
+        pricing_template_id: pricedRoomSelections[0]?.template_id || null,
```

（`pricedRoomSelections` 即第 1406 行迴圈使用的同一份陣列；此處只新增一個欄位，不動任何既有欄位與計算。）

## B. `src/types/order.ts`

```diff
   order_source: string;
+  pricing_template_id?: string | null;
   room_types: {
     id: string;
     name: string;
   } | null;
```

## C. 一致性測試（新檔 `src/utils/__tests__/templatePriceParity.test.ts`）

以正式環境現有的 pricing_templates（含 segments 型、room_overrides 型、單一 price 型）
× 一整個月的每一天（涵蓋平日／週五／週六／週日／國定假日）
× 有無專案覆寫價 × 有無 base row，
逐格比對 `resolveTemplatePricesFromRows()`（TS）與 `resolve_template_night_price()`（SQL RPC）的輸出，
任一格不同即測試失敗。此測試列為施工必過項目，且往後任一邊修改都會立刻被抓到。
