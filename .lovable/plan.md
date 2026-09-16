# 館別後台「AI 客服 → 常見問題」自助管理頁（設計稿．未施工）

讓民宿管理員與被授權員工，在自己的館別後台維護「客人常問的問題」，存檔後 AI 管家立即讀到。

## 一、查證結果（已確認的現況）

- `ai_knowledge` 已依 `accommodation_id` 分館；欄位：分類、標題、內容、標籤、優先度、啟用、建立/更新時間。
- 全文檢索欄位 `search_tsv` 是 **GENERATED ALWAYS STORED**，由資料庫自動維護，GIN 索引已存在 → **新增/修改條目一定會進索引，不需任何額外處理**（第 3 點驗證即可）。
- 目前 RLS：館別成員**只能讀**自己館與全域條目；只有 super_admin 能寫。→ 要新增館別端寫入政策。
- 表上**沒有** `created_by` / `updated_by`，所以總部要區分「總部維護 vs 館別自編」需補欄位。
- 權限機制齊備：`get_staff_module_permission` / `staff_can_edit_module`（hotel_admin 恆為 editable）。
- 稽核已有共用 hook `useAuditLog()` → 寫入 `audit_logs`。
- 總部即時測試元件：`src/pages/ai-training/AiTrainingPlayground.tsx` 可抽用。

## 二、資料庫（1 支 migration，不新增表）

1. `ALTER TABLE public.ai_knowledge ADD COLUMN created_by uuid, ADD COLUMN updated_by uuid;`（皆 nullable，歷史列為 NULL＝總部維護）
2. 掛既有的 `zz_ai_knowledge_set_updated_by` BEFORE INSERT OR UPDATE trigger（沿用上批已建立、已收權的 `public.set_updated_by()`，不新建 SECURITY DEFINER 函式）。
3. 新增三條館別端 RLS policy（既有 5 條政策**完全不動**）：

```sql
-- 寫入條件（三條共用）
accommodation_id IS NOT NULL
AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
AND public.staff_can_edit_module(accommodation_id, 'ai_faq')
```

- INSERT：`WITH CHECK (上述條件)` → 無法把條目寫到別館，也無法寫 `accommodation_id IS NULL`（總部全域條目）。
- UPDATE：`USING (上述條件) WITH CHECK (上述條件)` → 無法把條目「搬」到別館。
- **不給 DELETE**：館別端只能把 `is_active` 設為 false（停用），實體刪除仍只有 super_admin 可做。
- `GRANT INSERT, UPDATE ON public.ai_knowledge TO authenticated;`

## 三、module_key：新增 `ai_faq`

- 新增一個模組 key `ai_faq`（不沿用 `ai_training`，避免把總部訓練中心權限混進館別端）。
- `get_staff_module_permission` 的預設值表加一行 `WHEN 'ai_faq' THEN 'hidden'` → 一般員工預設看不到，需由館主在帳號管理開啟。
- hotel_admin / super_admin 不受此設定限制，恆為可編輯（既有行為）。

## 四、前端

| 檔案 | 動作 |
| --- | --- |
| `src/config/adminMenu.ts` | 新增選單項「AI 客服」→ 子項「常見問題」，`moduleKey: "ai_faq"` |
| `src/pages/admin/ai-faq/AdminAiFaq.tsx` | 新頁：列表＋搜尋＋新增/編輯 Dialog＋停用＋測試問答 |
| `src/App.tsx` | 新增路由 `/admin/ai-faq`，套既有模組權限守衛 |
| `src/components/ai-training/KnowledgeTestPanel.tsx` | 由 Playground 抽出的即時測試面板（總部頁改為引用，行為不變） |
| `src/pages/ai-training/AiTrainingKnowledge.tsx` | 只加一欄「來源／最後編輯者」 |

頁面內容：

- 列表：分類標籤、啟用狀態、最後更新時間、關鍵字搜尋（標題＋內容），停用條目灰底但仍列出。
- 編輯表單：問題（必填，上限 200 字）、答案（必填，上限 4000 字）、分類、啟用開關、編輯／預覽切換。
- 「停用」取代刪除，可再啟用。
- 「測試問答」按鈕：輸入問題直接打該館 AI，存完馬上驗證。
- 文案全用業者語言：「客人常問的問題」「這題要讓 AI 回答嗎」，不出現知識庫索引等工程詞。

## 五、稽核

寫入 **`audit_logs`**（既有表，沿用 `useAuditLog()`）：
`action_type` = create / update / disable / enable，`action_category` = `accommodation`，`entity_type` = `ai_knowledge`，`entity_id` = 條目 id，`entity_name` = 問題標題，`accommodation_id` = 該館，`details` 記錄變更前後的分類與啟用狀態。
＋ 資料列上的 `updated_by` 作為雙保險（直接走 API 的異動也留得下操作者）。

## 六、明確不動（不可 regression）

`ai_knowledge` 既有 5 條 RLS policy、`search_ai_knowledge` 函式、`search_tsv` 生成式欄位與 GIN 索引、總部訓練中心 CRUD／匯入匯出、`accommodation-ai-chat`／`portal-ai-chat`／`knowledge-search`／`lineLlm` 任何一行、其他模組權限預設值。

## 七、驗證方案

1. 新增條目後查 `search_tsv IS NOT NULL` 且 `search_ai_knowledge` 能命中該題。
2. 館別 A 管理員無法讀寫館別 B 條目、無法寫 `accommodation_id IS NULL` 的總部條目（判斷式求值驗證）。
3. `ai_faq` 設 hidden 的員工看不到選單、直接進路由被擋。
4. 停用後 AI 對話不再引用該題。
5. `audit_logs` 有對應列，操作者與時間正確。
6. tsgo 零錯誤；測試維持 1516 筆／23 個既有失敗基準；總部知識庫頁 CRUD 回歸。

---

依專案治理規則，本則訊息未出現「核准」，因此**只出設計稿，尚未修改任何檔案或資料庫**。
