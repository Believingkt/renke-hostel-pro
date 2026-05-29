## 目標

1. 民宿後台 `/admin/ai-training/*` 新增「AI 訓練中心」模組（複製 HQ 八分頁，per-accommodation 範圍）。
2. 對外開放一支 `accommodation-ai-chat` API + API Key 驗證，供台灣旅圖嵌入該民宿的 AI 管家。
3. 產出 `/admin/ai-training/api-docs` 文件頁，供前端工程師串接。

---

## 一、資料庫變更

### 1.1 既有表加 `accommodation_id`（per-accommodation 範圍）

- `ai_prompts` + `accommodation_id uuid NOT NULL`（既有列回填到「總部全局」假民宿 ID 或保留 null = 全局 fallback；建議 NOT NULL + 一筆「全局範本」由 HQ 維護，可被民宿覆寫）
- `ai_knowledge` + `accommodation_id uuid NOT NULL`
- `ai_examples` + `accommodation_id uuid NOT NULL`
- `ai_conversation_logs` + `accommodation_id uuid`（外部 chat 寫入時帶入）
- `ai_ab_tests` + `accommodation_id uuid NOT NULL`
- 全部加 `idx_xxx_accommodation_id`
- RLS：管理員/該民宿 staff 只能讀寫 `accommodation_id = 當前民宿` 的列；HQ super_admin 全可讀寫
- GRANT：`authenticated` SELECT/INSERT/UPDATE/DELETE；`service_role` ALL；無 `anon`

### 1.2 新表 `accommodation_ai_api_keys`

```text
id uuid pk
accommodation_id uuid not null
name text                    -- 標籤（如「台灣旅圖串接」）
key_hash text not null       -- SHA-256
key_prefix text not null     -- 顯示前 8 碼
is_active boolean default true
rate_limit_per_min int default 30
created_at, last_used_at, revoked_at
```

RLS：僅該民宿 admin 可管理；service_role 用 hash 比對驗證。

---

## 二、後端 Edge Function

### 2.1 新增 `accommodation-ai-chat`（對外 API）

- Public（`verify_jwt = false`），不帶 user JWT
- 驗證 `x-api-key` header → SHA-256 → 查 `accommodation_ai_api_keys` → 取得 `accommodation_id`
- IP + key 雙重 rate limit
- 系統提示詞：讀該民宿的 `ai_prompts (status=published)`，無則 fallback HQ 全局範本
- 注入該民宿的 `ai_knowledge` + `ai_examples`
- 工具集沿用 `ai-booking-chat`（房型/方案/訂單建立等）
- SSE streaming，寫 `ai_conversation_logs` 帶 `accommodation_id` + `source='external-tlt'`

### 2.2 修改 `ai-booking-chat`（民宿前台）

- 改為從 DB 讀 `ai_prompts` / `ai_knowledge` / `ai_examples`（依當前 `accommodationId`），保留現有工具
- 維持向下相容：DB 無資料時用既有硬編碼 fallback

### 2.3 修改 `portal-ai-chat`（HQ Playground / 多民宿入口）

- 接受 `accommodation_id` 參數時，套用該民宿訓練資料；否則用 HQ 全局 / 所有民宿

---

## 三、前端：民宿後台 AI 訓練中心

### 3.1 路由（`src/App.tsx`）

```text
/:alias/admin/ai-training              (layout)
  ├ index            → AdminAiTrainingDashboard
  ├ prompt           → AdminAiTrainingPrompt
  ├ knowledge        → AdminAiTrainingKnowledge
  ├ examples         → AdminAiTrainingExamples
  ├ conversations    → AdminAiTrainingConversations
  ├ playground       → AdminAiTrainingPlayground
  ├ versions         → AdminAiTrainingVersions
  ├ api-keys         → AdminAiTrainingApiKeys   ← 新增
  └ api-docs         → AdminAiTrainingApiDocs   ← 新增
```

### 3.2 程式碼策略

- 在 `src/pages/admin/ai-training/` 建立 8+2 個頁面
- **複製** HQ 對應頁面為起點（不抽共用元件以免破壞 HQ 既有功能），加上：
  - 所有 supabase 查詢 `.eq('accommodation_id', currentAccommodationId)`
  - 寫入時 `accommodation_id: currentAccommodationId`
- Layout 結構沿用 HQ 的左側導航 + 頂部狀態列

### 3.3 側邊欄（`AppSidebar.tsx`）

新增條目於「網紅導購」上方：

```text
{ title: "AI 管家", url: "/admin/ai-training", icon: Sparkles, moduleKey: "ai_training",
  subItems: [提示詞, 知識庫, 對話範例, 對話紀錄, 測試對話, 版本管理, API 金鑰, API 文件] }
```

`moduleKey: "ai_training"` 加入 `src/constants/staffPermissions.ts`。

### 3.4 API 金鑰管理頁

- 列表：name / key_prefix / last_used_at / rate_limit / 啟用狀態
- 動作：新增（顯示完整 key 一次，之後只看前綴）、停用、刪除
- 寫入：edge function `create-accommodation-ai-api-key`（hash 後存）

### 3.5 API 文件頁

模仿 `KolApiDocs.tsx` 結構（SEOHead + sticky header + 4xl container + Card 章節 + Code 元件）。章節：

1. 概述 + RESTful/Lock/Zap 三格特色
2. 認證（`x-api-key` header）
3. 端點：`POST /functions/v1/accommodation-ai-chat`
4. 請求/回應範例（SSE streaming，含 cURL + JS fetch）
5. 錯誤碼（401 invalid key / 429 rate limit / 402 credits）
6. 訓練資料維護指引（指向後台對應頁）

---

## 四、實作順序

1. **DB migration**：5 表加欄位、新表 + RLS + GRANT
2. **Edge functions**：`accommodation-ai-chat` 新增、`ai-booking-chat` 改 DB 讀取、`create-accommodation-ai-api-key`
3. **後台頁面**：8 個訓練分頁複製改 per-accommodation
4. **API 金鑰頁** + **API 文件頁**
5. **側邊欄/路由/權限**整合
6. QA：在森山測試完整流程（建 key → 提示詞 → 知識庫 → Playground 對話 → 外部 cURL 打通）

---

## 五、技術細節

- 模型：沿用既有 Anthropic Claude（`ai-booking-chat` 現況）
- Streaming：SSE，sample code 仿 `lovable-ai-gateway` 章節
- 既有 `ai_prompts` 等表的歷史資料：migration 將所有現有列填入「HQ 全局範本」假 ID（或新建 `accommodation_id IS NULL` 表示全局，搜尋時 `OR` 該民宿 ID），實作前我會先確認資料量再決定。
- 不更動 HQ AI 訓練中心既有頁面（避免破壞 super_admin 工作流）

---

## 六、Open Questions（需您確認）

1. **訓練資料層級**：HQ 維護「全局範本」+ 民宿可覆寫，還是民宿完全獨立？（推薦前者）
2. **API 金鑰權限**：API key 只允許 chat，還是也讓台灣旅圖 read 知識庫（如顯示常見問題）？
3. **計費**：每民宿 chat 是否要計 quota？目前不做、之後再說？
4. **`/ai-booking` 前台**：要不要也加「Powered by 台灣旅圖」之類的品牌切換能力？（看起來不在這次範圍）