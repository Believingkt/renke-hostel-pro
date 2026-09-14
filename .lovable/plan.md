# 上架引導 第 9 步 / 第 4 步 判定邏輯修正（施工前檔案清單）

## 會改到的檔案（共 3 個）

1. `src/lib/onboarding/steps.ts`
   - 第 9 步 `package_prices`：改為「未來 30 天視窗內，至少 7 個不重複日期」符合 (a) 或 (b)。
     - (a) 該日任一房型逐日房價 > 0（純住宿／二食／三食任一欄）且 `available_rooms > 0`
     - (b) 該日有啟用方案，依「特定日期覆寫 → 平假日價 → 方案基本價」算出有效售價 > 0 且該日適用
   - 第 4 步 `room_types`：
     - 無啟用方案 → 同館任一房型有照片即達標（房型名稱仍需齊全）
     - 有啟用方案 → 每個啟用方案都要有照片（先看方案自己的結構化房型分配縮圖，未設定才退回綁定房型的房型照片），任一沒有即整館未達標
   - `OnboardingSource` 介面擴充：逐日房價列（含餐型價欄位）、方案完整取價欄位（`sale_price`/`tier_prices`/`applicable_tiers`/`room_type_allocation`/`primary_room_type_id`/`room_type_ids`）、國定假日清單。
   - 取價與平假日分級沿用既有純函式（`classifyDayTier`、與 `packageDatePrice.ts` 相同的優先序規則），不改寫任何核心檔。

2. `src/hooks/use-onboarding-progress.tsx`
   - 只是把上述欄位多讀出來（`room_inventory_pricing` 加讀價格欄位、`accommodation_packages` 加讀取價與房型分配欄位、加讀 `public_holidays`）。全部唯讀 select，無任何寫入變動。

3. `src/lib/onboarding/__tests__/steps.test.ts`
   - 新增涵蓋：第 9 步 (a) 路徑 6 天／7 天門檻、(b) 路徑 6 天／7 天門檻、(a)+(b) 同日不重複計算；第 4 步無啟用方案沿用同館任一、有啟用方案逐案綁定照片、結構化分配縮圖優先、某一方案沒照片即整館未達標。

## 明確不會動到的檔案

- `src/components/booking-villa/BookingFlow.tsx`
- `supabase/functions/validate-order-prices/index.ts`
- `src/lib/packageDatePrice.ts`
- `src/hooks/use-room-pricing.tsx`
- `src/hooks/use-accommodation-packages.tsx`
- 任何 `/team`、分潤、退款、OTA 補單、Edge Function、cron
- 任何 DB schema／RLS／trigger／RPC —— 本批零 migration，`accommodation_onboarding_steps` 也不改
- `src/pages/admin/Onboarding.tsx`、`OnboardingBanner.tsx`、`adminMenu.ts`、`App.tsx`、`Dashboard.tsx`（判定邏輯不在這些檔內，無需更動）

## 已知可接受狀態

天送幸福和苑、奧莉薇雅生活小酒店這輪維持第 9 步未達標，不為其調整邏輯。

## Postcheck 會回報

①改動檔案清單 ②5 個保護檔 md5 施工前後對照（diff=0）③15 家逐一列出第 9、4 步結果 ④完整測試套件 git-archive 基準逐項比對 ⑤新增測試清單。完工不 Publish。
