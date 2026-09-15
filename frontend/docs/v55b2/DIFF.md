# V5.5B.2 — 確認信 / 會員訂單頁 備註白名單（設計稿，未施工）

決定：房間配置行顯示；email/URL 遮蔽關閉（收件人＝客人本人）；MemberOrderDetail.tsx 一併改。

## 0) 共用函式擴充（`supabase/functions/_shared/owltingNotesWhitelist.ts`）

新增 `maskContacts` 選項，並補一條通用「系統標籤行」規則（原清單漏掉 `[3DS Webhook]`、`[TapPay …]`，LE5G68B9 實測會外洩）。

```diff
 export interface WhitelistOpts {
   includeRoomLayout?: boolean; // default true
   maxGuestChars?: number;      // default 500
+  maskContacts?: boolean;      // default true（owlting 維持遮蔽；客人端關閉）
 }

 const LINE_RES: RegExp[] = [
   /^\s*🔒/,
   /^\s*【付款狀態變更】/,
-  /^\s*\[人客多收款狀態\]/,
-  /^\s*\[ATM(\s+Webhook)?\]/,
+  /^\s*\[[^\]]+\]/,   // 任何 [系統標籤] 開頭行：人客多收款狀態 / ATM / ATM Webhook / 3DS Webhook / TapPay / 奧丁丁修改通知
   /rec_trade_id/i,
   ...
 ];

-function sanitize(text: string, maxChars: number): string {
-  let out = text
-    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[已隱藏]")
-    .replace(/https?:\/\/\S+/g, "[連結已移除]")
-    .replace(/\n{2,}/g, "\n")
-    .trim();
+function sanitize(text: string, maxChars: number, mask: boolean): string {
+  let out = text;
+  if (mask) {
+    out = out
+      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[已隱藏]")
+      .replace(/https?:\/\/\S+/g, "[連結已移除]");
+  }
+  out = out.replace(/\n{2,}/g, "\n").trim();
   if (out.length > maxChars) out = out.slice(0, maxChars) + "…";
   return out;
 }
```
`buildOwltingNotes` 內：`const guest = sanitize(..., maxChars, opts.maskContacts !== false);`
（owlting-order-push 不傳此參數 → 行為不變，仍遮蔽。）

前端無法 import `supabase/functions/**`，因此同步新增 `src/utils/guestNotesWhitelist.ts`（同一份純函式，export `buildGuestNotes`），並加一支 `src/test/guest-notes-whitelist-parity.test.ts`：讀兩份檔案文字，斷言規則陣列與函式主體一致，避免日後分岔。

## 1) `supabase/functions/_shared/orderConfirmationEmail.ts`

```diff
+import { buildOwltingNotes } from "./owltingNotesWhitelist.ts";
@@ L80-94 刪除舊 extractGuestNotes 整段
-const extractGuestNotes = (notes?: string | null): string => { ... };
@@ L436
-  const guestNotes = extractGuestNotes(order.notes);
+  const guestNotes = buildOwltingNotes(order.notes, "", {
+    includeRoomLayout: true,
+    maskContacts: false,
+  });
```
`payLine` 傳空字串：信裡付款資訊已由獨立區塊依欄位計算，不從 notes 取。其餘版型不動；`guestNotes` 為空時「您的特殊需求」區塊照舊不顯示。

## 2) `src/pages/MemberOrderDetail.tsx`

```diff
+import { buildGuestNotes } from "@/utils/guestNotesWhitelist";
@@ L110-… 刪除舊 extractGuestNotes 整段
@@ L1178 / L1184
-        {extractGuestNotes(order.notes) && (
+        {guestNotes && (
...
-                {extractGuestNotes(order.notes)}
+                {guestNotes}
```
元件內先算一次：
```ts
const guestNotes = useMemo(
  () => buildGuestNotes(order?.notes, "", { includeRoomLayout: true, maskContacts: false }),
  [order?.notes],
);
```

**L1173 訂金百分比正則不受影響**：該行讀的是 `order.notes` 原文（`order.notes?.match(/的\s*(\d+)%/)`），不經過過濾函式；本次只改「特殊需求」區塊的顯示來源。且 `buildGuestNotes` 亦不會回寫 notes。若日後想改成讀過濾後文字才會受影響 — 本次不動。

## 3) 六筆真實訂單模擬（確認信與會員訂單頁輸出完全相同，兩處同參數）

| 訂單 | 過濾前 notes | 過濾後（信 / 會員頁皆同） |
|---|---|---|
| AT3J37G2 | 房間配置行 + [ATM] + [ATM Webhook] + 有預訂烤大叔代烤 | `【包區房間配置】四人房 3 間`<br>`有預訂烤大叔代烤` |
| DV5Q32E5 | 【團購】合作對象／方案／住宿費／訂金尾款 + 旅客備註三行 + [ATM] + 【取消】／退款處理／取消政策／原因 | `總共8大4小`<br>`小孩:1.5歲/3歲/5歲/6歲`<br>`使用國旅補助` |
| EL3G58Q5 | 房間配置行 + 三行現場備註 + [ATM]×2 | `【包區房間配置】雙人房 3 間、四人房 1 間`<br>`10 位 $ 43500`<br>`人數少優惠使用4個房間`<br>`後續人數新增, 要加價 Nicole`（無標記內部語，依先前確認接受） |
| LE5G68B9 | [3DS Webhook]×4 + 🔒 客人 email／退刷金額／交易編號 + 🔒 取消政策全文 | （空）→ 區塊不顯示 |
| LM6H56J4 | 房間配置行 + 🔒 取消／退款政策兩行 | `【包棟房間配置】帆船 2 間` |
| UG4P85X6 | 【團購】商業條件五行 + 旅客備註 + [ATM]×2 | `請協助在2間四人房及一間雙人房中準備嬰兒澡盆及一張小板凳，謝謝🙏` |

## 4) 影響面
- 只改顯示層：DB notes、PMS 後台、owlting 推送行為皆不變（owlting 只多吃到「泛用 [標籤] 行」規則，原本 ATM/收款狀態本就已擋，等於加強擋 3DS/TapPay 行）。
- 無 migration。前端需 Publish；Edge Function 需重新部署。

## 5) 未查證項目（如實回報）
團購訂單走的專屬信件模板，其 notes 處理邏輯本次**尚未查證**，不在此設計範圍內。
