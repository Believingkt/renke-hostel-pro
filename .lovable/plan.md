# 中英雙語切換：唯讀盤點 + 設計稿（未施工）

本輪未修改任何程式碼、資料庫、部署或設定。以下皆為查證結果與設計提案。

---

## 一、之前的殘留（有，而且品質堪用）

現況：上次的「固定文字＋字典」方案**確實留在專案裡，而且已經在一個頁面實際生效**（不是死碼）：

- 字典檔 `src/lib/bookingI18n.ts`（275 行，約 186 組文案 key，中／英雙份，含缺字回退與變數代入）
- 語言狀態 `src/contexts/BookingLocaleContext.tsx`（只存語言，存在瀏覽器 `booking_lang`，不碰網址、不碰訂房狀態）
- 切換鈕 `src/components/booking/BookingLanguageSwitch.tsx`（繁中／EN）
- 已接上線的頁面：**只有** `/booking/villa/:accId`（`BookingVilla.tsx` 及其 11 個子元件，約 158 處已翻譯）
- 既有測試：`src/test/booking-i18n-locale-state.test.tsx`、`booking-villa-i18n-render.test.tsx`（涵蓋預設中文、記憶語言、切換不動網址）
- 另有獨立的行程模組三語工具 `src/lib/tripI18n.ts`（中／日／英），與訂房頁互不相干

結論：**不重做，沿用擴充**。這套設計已符合需求 6、7、8（純前端狀態、不碰網址、不觸發任何寫入）。

確認第 2 點：資料庫目前**沒有** `translation_cache` 或任何等效翻譯快取表（已查 information_schema，名稱含 transl 的表 0 筆）；除 `/booking/villa/:accId` 外，**沒有任何頁面有語言切換**。與先前回報一致。

---

## 二、固定文字盤點（中文字串數量為估算掃描）

| 位置 | 檔案 | 中文片語數 | 現況 |
|---|---|---|---|
| 房源詳情（已完成） | `BookingVilla.tsx` + 11 元件 | 約 333 | 已抽字典 |
| **訂房主流程（填單／付款／摘要）** | `BookingFlow.tsx`（5996 行） | 約 1519 | 全部寫死在畫面裡 |
| 搜尋／選房列表 | `BookingSearchResults.tsx` | 約 175 | 寫死 |
| 單館訂房頁 | `BookingAccommodation.tsx` | 約 27 | 寫死 |
| 付款結果 | `PaymentResult.tsx` | 約 78 | 寫死 |
| 會員訂單列表 | `MemberOrders.tsx` | 約 101 | 寫死 |
| 會員訂單明細（取消／改期） | `MemberOrderDetail.tsx` | 約 263 | 寫死 |
| 訂單查詢（免登入） | `CustomerOrders.tsx` | 約 471 行 | 寫死 |

`BookingFlow.tsx` 是最大一塊，也是風險最高的一塊（訂房主流程、計價、付款都在同一支檔案裡）。

**通知信件**：由 `send-booking-confirmation`（438 行，約 69 段中文）、`send-cancellation-email`（252 行）、`send-order-confirmation`、`send-order-cancelled-email` 等函式在伺服器端直接組 HTML 字串；固定文案佔比極高（約八成以上是固定標題／欄位名／說明），變動的只有姓名、日期、金額、房型名稱。

---

## 三、動態內容盤點

後台維護、會顯示給客人的中文欄位（實查結果）：

- `accommodation_info`：name, short_name, description, hero_main_title, hero_subtitle, hero_description, review_summary, child_age_rules, 各種標籤欄位
- `room_types`：name（已有 `name_en`）, description, package_contents
- `accommodation_packages`：name, subtitle, guest_count_label, child_age_note, child_age_rules_override
- `booking_settings`：cancellation_policy, pet_policy, other_notes 及六組區塊標題／副標
- `booking_info_sections`：section_title / subtitle / content
- `faqs`：question, answer
- `about_section` / `about_features` / `custom_sections` / `location_info` / `accommodation_facilities` / `room_amenities` / `amenity_items` / `addon_settings`：各自的標題與說明欄位

訂單中顯示給客人的動態內容：房型／方案名稱、加購品名、取消政策文案、方案限制說明、客人自填備註（**建議不翻譯，原樣保留**）。

分類：
- **走固定字典**：日期格式、人數／房間單位、房型類別標籤、訂單狀態、付款方式、按鈕與驗證訊息
- **走自動翻譯**：介紹、政策、常見問答、方案說明等自由文字
- **不翻譯**：客人備註、地址門牌、電話、金額、訂單編號

---

## 四、技術架構

1. 語言切換**不會**動到日期、房型、方案、人數、加購、表單、步驟——現有 Context 只存語言字串，切換只重繪畫面（既有測試已驗證不呼叫 history、不改網址）。新增頁面沿用同一條規則。
2. 路由是 React Router（`src/App.tsx`），訂房頁走 `/booking/...`、`/book`。**採純前端 state，不加語言網址前綴**，避免動到需求 9 明列不可動的網址與搜尋條件。
3. 外部翻譯：Edge Function 對外連線可用，且專案內已有現成範例 `supabase/functions/trip-translate/index.ts`（走 Lovable AI 閘道做中→日／英翻譯，不需自備金鑰）。**建議照抄這條路，不另接 Google／DeepL。**

---

## 設計稿

### A. 固定文字（延伸現有字典）
擴充 `src/lib/bookingI18n.ts`，依頁面分批加 key，逐檔把寫死中文換成 `t("...")`。分批順序：付款結果 → 搜尋列表 → 會員訂單／明細 → 訂單查詢 → 訂房主流程（最後做，單獨一批）。切換鈕加到各頁頁首。

### B. 動態內容（新表 + 新函式）
1. 新增 `translation_cache` 表：來源表、欄位、資料 ID、原文雜湊、語言、翻譯結果、更新時間；唯一鍵（來源表, 欄位, 資料 ID, 語言, 原文雜湊）。公開讀、只有伺服器可寫。
2. 新增一支 `translate-content` Edge Function：收「欄位清單＋原文」，先查快取，缺的才呼叫 Lovable AI 翻譯並寫回快取。後台改中文 → 雜湊變 → 自動重譯，後台完全不需維護英文欄位。
3. 前端加一個 `useTranslatedFields` hook：英文模式時整批送出該頁動態文字，回來後替換顯示；中文模式完全不呼叫。翻譯未回來前顯示原文，不做骨架、不閃爍。
4. `room_types.name_en` 已有值時優先採用，不重複翻譯。

### C. 通知信件
在信件函式中依訂單語言（下單當下記錄的語言）輸出中文或中英對照。

---

## 需要您裁示的兩個範圍衝突（設計稿不自行決定）

1. **新增 Edge Function**：需求第 12 點只開放新增 `translation_cache` 表，第 13 點禁止動 Edge Function。動態內容自動翻譯必須有伺服器端才能安全呼叫翻譯服務。請確認是否同意「**新增**一支全新函式 `translate-content`」（既有函式一律不動）。
2. **信件雙語**：需求第 10 點要求信件雙語，但第 13 點禁止改既有 Edge Function 邏輯。信件是伺服器端組的，不改既有函式就做不到。請擇一：(a) 例外開放修改那 4 支寄信函式；(b) 信件本輪不做，只做網頁；(c) 新增獨立英文信件函式，既有中文信件不動。

---

## 修改前／修改後（白話）

**修改前**：只有房源詳情那一頁有繁中／EN 切換鈕；其他訂房步驟、會員中心、訂單查詢、信件全是中文。切成英文後，民宿介紹、政策、常見問答等後台輸入的內容仍是中文。

**修改後**：訂房從搜尋到付款完成、會員中心、訂單查詢每一頁都有切換鈕，選了英文就整頁英文。後台輸入的介紹、政策、房型與方案名稱會自動翻成英文顯示，您**不需要**在後台多打一份英文；後台改了中文，前台英文會自動跟著更新。語言會被記住，重新整理仍是英文。切換語言不會清掉已選的日期、房型、人數、加購或已填的表單，也不會重新計價或送出任何訂單。

## 檔案白名單與風險

新增：`translation_cache` 表、`translate-content` 函式、`useTranslatedFields` hook、相關測試。
修改：`bookingI18n.ts`、`BookingFlow.tsx`、`BookingSearchResults.tsx`、`BookingAccommodation.tsx`、`PaymentResult.tsx`、`MemberOrders.tsx`、`MemberOrderDetail.tsx`、`CustomerOrders.tsx`（僅顯示層字串替換）。
不動：計價、庫存、人數限制、加購、優惠、建單、付款退款、網址與搜尋、後台、/team、OTA／補單、既有 Edge Function、cron。

最大風險是 `BookingFlow.tsx`（5996 行、約 1519 段中文），建議獨立一批施工並單獨驗收。
