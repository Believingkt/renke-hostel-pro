# V5.5B.3 — points-booking-api 備註過濾 + 聯絡資料處理（設計稿，尚未施工）

確認方向：房間配置保留、不放 `[人客多收款狀態]` 行、`maskContacts: true`、新增夥伴標籤前綴豁免。

## 1) 共用純函式新增 `partnerTagPrefixes`（豁免夥伴自送標籤）

`supabase/functions/_shared/owltingNotesWhitelist.ts`
（`src/utils/guestNotesWhitelist.ts` 必須同步同一份改動，`guest-notes-whitelist-parity.test.ts` 會把關）

```diff
 export interface WhitelistOpts {
   includeRoomLayout?: boolean; // default true
   maxGuestChars?: number;      // default 500
   maskContacts?: boolean;      // default true
+  partnerTagPrefixes?: string[]; // V5.5B.3 夥伴標籤前綴豁免，如 ["StarChain 星鏈"]
 }
+
+function escapeRe(s: string): string {
+  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
+}
+
+// 只剝除行首、且完全等於夥伴名稱的 [標籤]；其餘 [系統標籤] 行維持整行剔除
+function stripPartnerTags(line: string, prefixes: string[]): string {
+  let out = line;
+  for (const p of prefixes) {
+    const re = new RegExp(`^\\s*\\[\\s*${escapeRe(p)}\\s*\\]\\s*`);
+    if (re.test(out)) { out = out.replace(re, ""); break; }
+  }
+  return out;
+}
@@ buildOwltingNotes 內，split 之後
-  let lines = text.split(/\r?\n/);
+  const partnerTags = opts.partnerTagPrefixes ?? [];
+  let lines = text.split(/\r?\n/);
+  if (partnerTags.length) lines = lines.map((l) => stripPartnerTags(l, partnerTags));
```

預設 `partnerTagPrefixes = []`，OwlTing 推送與會員中心行為 **完全不變**（零回歸）。

## 2) `supabase/functions/points-booking-api/index.ts`（handleGetOrder）

```diff
+import { buildOwltingNotes as buildGuestNotes } from "../_shared/owltingNotesWhitelist.ts";
@@ handleGetOrder 回傳前
+  const safeNotes = buildGuestNotes(order.notes, "", {
+    includeRoomLayout: true,      // 房配保留，供對帳／客服
+    maxGuestChars: 500,
+    maskContacts: true,
+    partnerTagPrefixes: [partner.platform_name], // 例：StarChain 星鏈
+  });
+  const { notes: _rawNotes, guest_phone, guest_email, ...safeOrder } = order;
+
   return jsonResponse({
     order: {
-      ...order,
+      ...safeOrder,
+      notes: safeNotes || null,
+      guest_phone: maskPhone(guest_phone),
+      guest_email: maskEmail(guest_email),
       accommodation_name: acc?.name,
```

`POST /orders`（寫入端）不動：夥伴自送 notes 仍原樣存進 PMS，只有回傳端過濾。

## 3) guest_phone / guest_email 方案（請擇一）

| 方案 | 作法 | 優點 | 缺點 |
|---|---|---|---|
| **A（建議）預設遮蔽** | 一律回 `09xx-xxx-123` / `a***@star.com`；夥伴本來就自己送過原始值，回傳只是對帳用 | 不需改合約、立即降風險 | 夥伴若靠回傳值做客服撥號會不便 |
| B 選配欄位 | 需 `?include=contact` 且 `points_platform_partners` 新增 `can_read_contact boolean default false` 才回全文 | 彈性、可逐夥伴授權 | 需 migration + 夥伴端配合 |
| C 完全移除 | 回傳不含這兩欄 | 最安全 | 夥伴無法核對是誰 |

建議 **A 先上**（零 migration、零流量期無痛），日後有需求再升級為 B。遮蔽函式（純函式，寫在 index.ts 內）：

```ts
const maskPhone = (v?: string | null) =>
  v ? v.replace(/\d(?=\d{3})/g, "x") : v ?? null;          // 0912345678 → xxxxxxx678
const maskEmail = (v?: string | null) =>
  v ? v.replace(/^(.).*(@.*)$/, "$1***$2") : v ?? null;     // abc@star.com → a***@star.com
```

## 4) 模擬驗證（實跑結果）

opts：`includeRoomLayout: true, maxGuestChars: 500, maskContacts: true, partnerTagPrefixes: ["StarChain 星鏈"]`，payLine 傳空字串。

### A 夥伴需求 + 🔒 金額異動（你指定的組合）
過濾前：
```
[StarChain 星鏈] 需要嬰兒床一張，晚到約21:00
🔒 2026-09-01 10:22 Nicole 將金額由 8,800 改為 9,300（加人）
【付款狀態變更】未付款 → 已付訂金
```
過濾後：
```
需要嬰兒床一張，晚到約21:00
```
→ 旅客需求保留、🔒 與付款狀態行移除。

### B 只有夥伴自己的需求文字
前：`[StarChain 星鏈] 點數訂房 - 用戶ID: SC-99213`
後：`點數訂房 - 用戶ID: SC-99213`

### C 房配 + 夥伴需求 + 內部異動混合
前：
```
【包棟房間配置】A棟 2 間、B棟 1 間
[StarChain 星鏈] 素食兩位，需要停車位
[ATM] 虛擬帳號 812-1234567890 繳款期限 2026-09-05
rec_trade_id: 2026090112345
🔒 2026-09-02 09:00 小倩 加購早餐 +600
```
後：
```
【包棟房間配置】A棟 2 間、B棟 1 間
素食兩位，需要停車位
```

### D 完全沒有 notes
前：`null` → 後：空字串，回傳 `notes: null`。

### E 夥伴需求含 email / 連結（確認遮蔽仍生效）
前：`[StarChain 星鏈] 請寄收據到 abc@star.com 或 https://star.com/x`
後：`請寄收據到 [已隱藏] 或 [連結已移除]`

## 5) 風險與回滾
- 只改 1 支 Edge Function 回傳 + 1 個共用純函式新增選項（預設關閉）。
- 無 migration、無 DB 寫入、不影響 PMS 後台顯示與 OwlTing 推送。
- 回滾＝還原兩檔並重新部署。
