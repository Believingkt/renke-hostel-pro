# AI 設定：路由守衛 + RLS 收斂評估（唯讀查證與設計，未施工）

## 一、立即止血：補上路由守衛（設計）

### 現況（實查）
- `/hq/ai-training`（含 prompt / knowledge / examples / playground / versions / reply-templates / model-training / conversations / api-keys / api-docs）掛在 `App.tsx:742` 起的區塊，**沒有任何 `RequireHQRole`**，只靠 `AiTrainingLayout` 的 `canView("ai_training")`。
- `useStaffPermissions` 把 `hotel_admin` / 泛用 `admin` / `super_admin` 視為 `isAdmin` → 全模組 editable，因此 **hotel_admin 直接輸入網址可進入並操作寫入頁**。
- `/hq/knowledge/index`、`/hq/knowledge/search`（`App.tsx:784`、`787`）**無任何守衛**（唯讀頁）。
- `/hq` 主頁（`App.tsx:838`）已包 `HQIndexGate`：只有 `super_admin`/`admin` 看完整後台，其餘可登入角色被導去業主月結。`AiOpsInsights` 是 `Headquarters.tsx:1372` 的 `ai-insights` 分頁，因此已被 `HQIndexGate` 覆蓋。
- 專案已有現成守衛：`RequireHQRole allow={[...]}`（未登入 → `/hq-auth`；已登入但無權 → `/hq`，並跳 toast）。

### 設計
1. 在 `src/lib/hqAccess.ts` 新增單一真實來源：
   ```ts
   /** 可進入 AI 訓練中心與知識庫（讀寫）的角色 */
   export const HQ_AI_ROLES: AppRole[] = [...HQ_FULL_ACCESS_ROLES]; // super_admin, admin
   ```
2. `App.tsx`：把整個 `/hq/ai-training` 父路由的 element 由
   `<Suspense><AiTrainingLayout /></Suspense>`
   改為
   `<RequireHQRole allow={HQ_AI_ROLES}><Suspense><AiTrainingLayout /></Suspense></RequireHQRole>`。
   包父路由即可覆蓋全部子頁（含 prompt / versions / knowledge / examples / playground / reply-templates），不需逐條改，也不會漏掉未來新增子頁。
3. 同樣把 `/hq/knowledge/index`、`/hq/knowledge/search` 各自包一層 `RequireHQRole allow={HQ_AI_ROLES}`。
4. `AiTrainingLayout` 內原本的 `canView("ai_training")` 判斷維持不動（雙保險），只是不再是唯一防線。
5. `AiOpsInsights`：`/hq` 已有 `HQIndexGate`，不重複加守衛；設計上僅在文件記錄「其保護來源為 HQIndexGate」，避免未來有人把該元件搬到無守衛路由。

### 影響評估
- `super_admin` / `admin`：`RequireHQRole` 直接放行，行為與現在完全相同（載入時 roles 未解析回傳 `null`，不會閃錯誤畫面）。
- `hotel_admin` / `staff` / 其他角色：網址直達 → toast「沒有存取權限」→ 導回 `/hq`（未登入則 `/hq-auth`）。
- 不動任何寫入邏輯、不動 RLS、無 DB migration。

### 驗收測試（核准後施工時實際執行，不只推論）
1. 以 `super_admin` 實測進入 6 個頁面，確認可正常讀寫（至少開啟編輯表單，不實際存檔）。
2. 以真實 `hotel_admin` 帳號登入後，逐一輸入 `/hq/ai-training/prompt`、`versions`、`knowledge`、`examples`、`playground`、`reply-templates`、`/hq/knowledge/index`、`/hq/knowledge/search`，截圖確認被擋並導回。
3. 以 `finance` / `am` 帳號確認 `/hq/bonus-settings` 既有流程不受影響。

## 二、RLS 是刻意保留還是殘留？（查證結果）

Migration 時間線（`supabase/migrations`）：
- `20260520084059` 建表，只有「team 層 admin」政策，**當時無 accommodation_id 欄位**。
- `20260524155031` 收斂為「read admin / write super」。
- `20260529081554` 加上 `accommodation_id`，註解明寫「NULL = HQ 全域範本」，同時新增「Accommodation members manage own prompts」等館別層政策，並建 `accommodation_ai_api_keys`。→ 這是**刻意設計的多租戶館別 AI 功能**，當時 `/admin` 有對應入口。
- `20260604041009` 把館別層拆成 read（館內成員）／write（該館 super_admin、hotel_admin）。
- `20260812181848` 新增「HQ admins manage global ...」，用 `is_admin_or_super()`。
- `20260830104957` 新增 `staff_can_edit_module(accommodation_id,'ai_training')` 的 staff 層寫入政策 —— 對應當時「staff 模組權限」功能上線。
- `20260902062945` 把**全域**列的讀寫收成 `is_super_admin()`，但**沒有動館別層與 staff 層政策**。

事實判讀（不含建議）：館別層／staff 層政策當初是刻意建立的功能設計；`20260902` 的收斂只處理全域列，館別層在 UI 搬到 `/hq`、`/admin` 改為 `MovedToHQCard` 之後**沒有跟著清理**。repo 內查無任何文件或註解說明「保留館別層供未來使用」。目前 DB 實況：prompts 4 / knowledge 10 / examples 10 / ab_tests 0 / reply_templates 3 / insight_cards 3，**館別層列數全為 0**。

### 69 筆 ai_training 授權（其中 38 筆 editable）能怎麼寫？
- 前端：`/admin` 全數為 `MovedToHQCard`；`/team`、`/reception`、前台無引用。唯一寫入 UI 在 `/hq/ai-training/*`，一般 `staff` 會被 `AiTrainingLayout` 的 `canView("ai_training")` 擋（除非其 `staff_module_permissions` 給了 ai_training 可見，38 筆 editable 即屬此類 → 目前**可以**用網址直達進入寫入頁）。
- 後端 Edge Functions：`portal-ai-chat`、`accommodation-ai-chat`、`knowledge-search`、`_shared/lineLlm` 對這些表**只有 select**，無寫入 API。
- 因此路徑有二：(a) 直接輸入 `/hq/ai-training/*` 網址（第一項守衛可堵住）；(b) 繞過前端直接呼叫 Supabase REST/JS（只有 RLS 能堵）。

### RLS 收斂選項（供決策，未施工）
- A. 只做守衛，RLS 不動：`/hq` URL 路徑被堵，但 (b) 直接呼叫 API 仍可寫入館別層列。
- B. 守衛 + 移除館別層／staff 層寫入政策（保留讀取政策）：因館別層列數為 0，理論上零資料影響；需在夜間視窗執行並附 precheck（再次確認 6 張表 `accommodation_id IS NOT NULL` 皆為 0 筆）/ postcheck（政策清單比對、`/hq` 全域讀寫回歸）。
- C. 一併把 `ai_insight_cards`、`ai_reply_templates` 的 `is_admin_or_super()` 改為 `is_super_admin()`（對應 warn 級 finding）；需先確認目前實際使用者是否含泛用 `admin`。

## 三、portal-ai-chat 館別過濾 bug 的急迫性（評估）

事實：該 bug 只有在存在「館別層 knowledge / examples / reply_templates」時才會讓館別內容外溢到全平台回覆；目前這三張表館別層列數皆為 0。

評估：若採 A（只加守衛），源頭未完全堵住 —— 具 ai_training editable 的帳號仍可直接呼叫 API 建立館別層列，屆時 bug 會立即生效，因此在 A 之下**不建議無限期後排**。若採 B（移除館別層寫入政策），新的館別層資料在資料庫層即無法產生，此 bug 可安全排入常規修復佇列。無論何者，這是讀取端的正確性問題，修法屬低風險（加上 accommodation 過濾條件），可與 B 同一夜間視窗一併處理。

## 現況確認
本次未修改任何檔案、資料或政策。上述皆為查證結果與設計，待核准後才施工。
