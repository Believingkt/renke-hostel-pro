# V5.5B.1 — owlting-order-push 備註白名單過濾（設計，未施工）

## 目的
目前推給 OwlTing 的 `<SpecialRequests>` 是 `orders.notes` 全文 + `[人客多收款狀態]` 一行。
notes 全文含內部稽核、金流帳號、團購商業條件、保留單內部語，這些不該外送到 OTA/CM。
改為「白名單：只推明確允許的段落」。

## 現況
`supabase/functions/owlting-order-push/index.ts` L447-448：
```
const payLine = `[人客多收款狀態] ...`;
const combinedNotes = [order.notes?.trim() || null, payLine].filter(Boolean).join("\n");
```
`xml.ts` 把 `notes` 原文塞進每個 RoomStay 的 `<SpecialRequest Name="...">`。
`orders` 只有 `notes` 一個文字欄位，沒有獨立的旅客需求欄位 → 白名單只能在 notes 上做「段落分類」。

## 白名單規則（推送內容只有這三塊，其餘一律不送）

| # | 允許內容 | 來源判定 |
|---|---|---|
| W1 | `[人客多收款狀態] …` | 每次推送即時重算（不取自 notes，避免舊值回灌） |
| W2 | 房間配置行 `【包棟房間配置】…` / `【包區房間配置】…` | 行首 regex；房務現場需要 |
| W3 | 旅客需求自由文字 | notes 去除所有「已知內部段落」後的殘餘純文字行 |

W3 的「已知內部段落」黑名單（在白名單前先剝除，剝完剩下的才算旅客需求）：

1. `【額外現場加購備註…】…【額外現場加購備註END】`、`【額外現場加購金額…】…【額外現場加購金額END】`（整塊）
2. `🔒` 開頭的鎖定稽核行（取消／改期／金額異動）
3. `[ATM] …`、`[ATM Webhook] …`、含 `rec_trade_id`／`虛擬帳號`／`822-` 帳號的行
4. `【付款狀態變更】…`（已由 W1 取代）
5. `【團購】` 區塊：只保留 `旅客備註：` 之後的文字，其餘（合作對象／方案／住宿費／訂金尾款／折扣碼）剝除
6. `[YYYY-MM-DD 奧丁丁修改通知]`、`奧丁丁訂單由業主補單 (OBE: …)` 等回聲行（避免把 OwlTing 自己的資料推回去）
7. `折扣碼設定：`、`社群帳號連結：`（KOL 內部）
8. `【測試資料｜App Review…】`
9. Email 位址、`保留到/保留至 … + 人名` 這類保留單內部語 → 由第 10 條的保守規則處理
10. 兜底防護：剝除後的殘餘文字，套 email/URL 遮蔽、去除連續空行，並限長 500 字元（超過截斷加「…」）

順序：剝除區塊 → 逐行黑名單過濾 → 團購段落抽取 → 兜底清洗 → 依序拼 W2、W3、W1。

## 實作位置（施工時）
- 新檔 `supabase/functions/_shared/owltingNotesWhitelist.ts`
  - `export function buildOwltingNotes(rawNotes, payLine, opts?): string`
  - 純函式、無 I/O，可單元測試
- `owlting-order-push/index.ts` L448 改呼叫此函式（唯一改動行）
- 新檔 `owltingNotesWhitelist_test.ts`：以現網 25 筆真實 notes 樣本為 fixture，逐條斷言「不得出現」清單（🔒、rec_trade_id、822-、折扣碼、合作對象、email）與「必須保留」清單（加床、烤肉爐、嬰兒澡盆、房間配置、收款狀態）

## 影響面與風險
- 只影響外送 XML 內容；DB 的 notes 完全不動，PMS 後台顯示不變。
- 風險：W3 誤剝旅客需求（例如旅客本人寫了 URL）。以測試 fixture 覆蓋，並在 `owlting_push_queue` 的 log payload 保留「過濾前/後」兩份文字供事後查核。
- 不需要 migration，無資料異動；部署為 Edge Function 更新，可即時回滾。

## 未決項（需你決定）
1. W2 房間配置行是否要推給 OwlTing？（推＝現場方便；不推＝更乾淨）
2. W3 兜底長度 500 字元是否合適？
3. 是否要在 HQ 設定頁做「推送備註內容」開關（房間配置／旅客需求／收款狀態三個 checkbox），還是先寫死？
