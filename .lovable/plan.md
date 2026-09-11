# 第三批雙語：會員中心兩頁＋加入行事曆按鈕（設計稿，未施工）

## 範圍

只做三個檔案的**畫面文字**雙語：

1. `src/pages/MemberOrders.tsx`（訂單查詢清單，約 101 處中文）
2. `src/pages/MemberOrderDetail.tsx`（訂單明細＋自助取消／改期，約 263 處中文）
3. `src/components/booking/AddToCalendarButton.tsx`（上一批發現殘留的「加入行事曆」按鈕）

字典沿用 `src/lib/bookingI18n.ts`（只增 key、不改既有 key），動態內容（民宿名／房型名／方案名／政策文字）沿用已驗證的 `useTranslatedFields` + `translate-content`。

**不動**：`BookingFlow.tsx`、`CustomerOrders.tsx`、四支通知信件函式、`member-order-manage`、`claim-order`、任何 RPC／SQL／schema／cron。

## Precheck 基準（施工前）

| 檔案 | 行數 | md5 |
| --- | --- | --- |
| `src/pages/MemberOrders.tsx` | 679 | `1e8490e942b8d17f8caabf7cbdab73ef` |
| `src/pages/MemberOrderDetail.tsx` | 1499 | `97e849c37eedce58619795a388a8f41e` |
| `src/components/booking/AddToCalendarButton.tsx` | 69 | `93f7a4bb63105f1c7d4f0f0c647cbd5a` |
| `src/lib/bookingI18n.ts`（起點） | 529 | `41238ab41bfd6f661129cdc230e7bf6c` |
| `src/lib/stayCalendar.ts`（不動，僅列基準） | 195 | `396aabf65f23d66e53c544db7fac00f6` |

## 白話：改前 vs 改後

- 改前：這兩頁所有文字寫死中文，切成英文後整頁仍是中文。
- 改後：整頁包進語言 Provider、右上角有中英切換鈕；固定文字（頁籤、狀態標籤、按鈕、欄位名、對話框、提示、驗證訊息、日期格式）走字典；民宿名／房型名／方案名等後台維護內容走自動翻譯，翻譯回來前先顯示原文不閃爍；中文模式完全不呼叫翻譯服務。
- 語言選擇存在瀏覽器本機（同前兩批的 `booking_lang`），不進網址、不影響任何連結參數。

## 如何確保「取消／改期」邏輯一行都不動

自助取消／改期的實際行為全部集中在 `MemberOrderDetail.tsx` 這四個呼叫點：第 545、590、617 行的 `member-order-manage`，以及第 694 行的 `send-order-confirmation`。施工紀律：

1. 這四個 `functions.invoke` 的**函式名稱與 body 內容一字不動**，改動只允許發生在 JSX 顯示文字與 `toast` 訊息字串。
2. 退款金額、取消費、可否取消／改期的判斷條件、日期計算、狀態判斷式全部禁止觸碰；不得順手重構、不得改變 `if` 條件、不得調整 `useEffect` 依賴。
3. 後端函式 `member-order-manage`、`claim-order` 與四支信件函式，postcheck 一律出示 diff＝0。
4. 顯示層若需要英文狀態文字，只在「顯示的那一刻」把既有狀態值映射成字典 key，不改變狀態值本身，也不改變任何送給後端的欄位。

## Postcheck 會逐項附上

1. 三個檔案逐字 diff。
2. `bookingI18n.ts` 只增不改的 diff（刪除行為 0）。
3. 新增輕量迴歸測試：證明切換語言後，取消／改期送出的函式名稱與 body 參數逐字相同、呼叫次數不變、中文模式不呼叫翻譯、資料查詢不重跑。
4. 既有 i18n 測試全綠 verbose 輸出＋型別檢查。
5. 英文模式人工核對：畫面無殘留中文，**並附該頁對 `translate-content` 的實際 HTTP 狀態**（依新規則）。
6. `BookingFlow.tsx`、`CustomerOrders.tsx`、四支信件函式、`member-order-manage`、`claim-order`、付款相關四支函式 diff＝0。

施工過程若發現任何「非改不可」但不在上表的檔案（例如共用元件），會**先停下來問您**，不會先改再回報。
