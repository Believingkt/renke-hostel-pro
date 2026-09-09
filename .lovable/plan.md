# AI 六張表 RLS 收斂 + portal-ai-chat 館別過濾（設計，未施工）

## 一、目前 policy 清單（實查 pg_policies）

標記：❌ = 本次移除、✅ = 保留

### ai_prompts
| policy | cmd | USING / CHECK | 處置 |
|---|---|---|---|
| HQ admins manage global prompts | ALL | `(accommodation_id IS NULL) AND is_super_admin(auth.uid())`（USING=CHECK） | ✅ |
| ai_prompts write super | ALL | `user_has_team_role(auth.uid(),'super_admin')` | ✅ |
| ai_prompts read admin | SELECT | `is_super_admin(auth.uid())` | ✅ |
| Accommodation members read global prompts | SELECT | `accommodation_id IS NULL` | ✅ |
| Accommodation members read own prompts | SELECT | `accommodation_id IS NOT NULL AND user_has_access_to_accommodation(...)` | ✅（讀取不動） |
| Accommodation admins manage own prompts | ALL | 館別 + super_admin/hotel_admin | ❌ |
| Staff with ai_training editable insert own prompts | INSERT | `accommodation_id IS NOT NULL AND staff_can_edit_module(accommodation_id,'ai_training')` | ❌ |
| Staff with ai_training editable update own prompts | UPDATE | 同上 | ❌ |
| Staff with ai_training editable delete own prompts | DELETE | 同上 | ❌ |

### ai_knowledge
| policy | cmd | 處置 |
|---|---|---|
| HQ admins manage global knowledge (ALL, `accommodation_id IS NULL AND is_super_admin`) | ALL | ✅ |
| ai_knowledge write super (ALL, `user_has_team_role(...,'super_admin')`) | ALL | ✅ |
| ai_knowledge read admin / Accommodation members read global knowledge / read own knowledge | SELECT | ✅ |
| Accommodation admins write own knowledge | INSERT | ❌ |
| Accommodation admins update own knowledge | UPDATE | ❌ |
| Accommodation admins delete own knowledge | DELETE | ❌ |
| Staff with ai_training editable insert / update / delete own knowledge | INSERT/UPDATE/DELETE | ❌（3 筆） |

### ai_examples
| policy | cmd | 處置 |
|---|---|---|
| HQ admins manage global examples (ALL, 全域 + is_super_admin) | ALL | ✅ |
| ai_examples write super (ALL, team super_admin) | ALL | ✅ |
| ai_examples read admin / read global examples / read own examples | SELECT | ✅ |
| Accommodation admins manage own examples | ALL | ❌ |
| Staff with ai_training editable insert / update / delete own examples | INSERT/UPDATE/DELETE | ❌（3 筆） |

### ai_ab_tests
| policy | cmd | 處置 |
|---|---|---|
| ai_ab_tests write super (ALL, team super_admin) | ALL | ✅ |
| ai_ab_tests read admin / Accommodation members read own ab tests | SELECT | ✅ |
| Accommodation admins manage own ab tests | ALL | ❌ |
| Staff with ai_training editable insert own ab tests | INSERT | ❌ |
| Staff with ai_training editable update own ab tests | UPDATE | ❌ |

### ai_reply_templates
| policy | cmd | USING/CHECK | 處置 |
|---|---|---|---|
| ai_reply_templates write super | ALL | team super_admin | ✅ |
| ai_reply_templates read admin | SELECT | `is_admin_or_super()` | ✅（讀取不動） |
| HQ admins manage reply templates | ALL | `is_admin_or_super()` | 🔁 改寫為 `is_super_admin(auth.uid())`（此表無 accommodation_id，寫入權從 hotel_admin 收斂到 super_admin，對應 warn finding） |

### ai_insight_cards
| policy | cmd | USING/CHECK | 處置 |
|---|---|---|---|
| Admins manage insight cards | ALL | `is_admin_or_super()` | 🔁 改寫為 `is_super_admin(auth.uid())` |
| Assignees can view own cards | SELECT | `assignee_id = auth.uid()` | ✅ |
| Assignees can update own cards | UPDATE | `assignee_id = auth.uid()` | ✅（承辦人結案流程需要） |

> 備註：`ai_reply_templates`、`ai_insight_cards` 沒有 `accommodation_id` 欄位，所以不是「館別層」而是「泛用 admin 可寫」，一併收斂為 super_admin，否則 hotel_admin 仍能改全平台樣板與洞察卡。若你要把這兩張表留到下一輪，我把 🔁 兩段從 migration 拿掉即可。

## 二、Migration SQL

```sql
-- ===== PRECHECK：館別層必須 0 筆，否則整個 migration 中止 =====
DO $$
DECLARE n int;
BEGIN
  SELECT
    (SELECT count(*) FROM public.ai_prompts   WHERE accommodation_id IS NOT NULL)
  + (SELECT count(*) FROM public.ai_knowledge WHERE accommodation_id IS NOT NULL)
  + (SELECT count(*) FROM public.ai_examples  WHERE accommodation_id IS NOT NULL)
  + (SELECT count(*) FROM public.ai_ab_tests  WHERE accommodation_id IS NOT NULL)
  INTO n;
  IF n <> 0 THEN
    RAISE EXCEPTION 'PRECHECK FAILED: 發現 % 筆館別層 AI 資料，中止收斂', n;
  END IF;
  RAISE NOTICE 'PRECHECK OK: 館別層 0 筆';
END $$;

-- ===== ai_prompts =====
DROP POLICY IF EXISTS "Accommodation admins manage own prompts" ON public.ai_prompts;
DROP POLICY IF EXISTS "Staff with ai_training editable insert own prompts" ON public.ai_prompts;
DROP POLICY IF EXISTS "Staff with ai_training editable update own prompts" ON public.ai_prompts;
DROP POLICY IF EXISTS "Staff with ai_training editable delete own prompts" ON public.ai_prompts;

-- ===== ai_knowledge =====
DROP POLICY IF EXISTS "Accommodation admins write own knowledge"  ON public.ai_knowledge;
DROP POLICY IF EXISTS "Accommodation admins update own knowledge" ON public.ai_knowledge;
DROP POLICY IF EXISTS "Accommodation admins delete own knowledge" ON public.ai_knowledge;
DROP POLICY IF EXISTS "Staff with ai_training editable insert own knowledge" ON public.ai_knowledge;
DROP POLICY IF EXISTS "Staff with ai_training editable update own knowledge" ON public.ai_knowledge;
DROP POLICY IF EXISTS "Staff with ai_training editable delete own knowledge" ON public.ai_knowledge;

-- ===== ai_examples =====
DROP POLICY IF EXISTS "Accommodation admins manage own examples" ON public.ai_examples;
DROP POLICY IF EXISTS "Staff with ai_training editable insert own examples" ON public.ai_examples;
DROP POLICY IF EXISTS "Staff with ai_training editable update own examples" ON public.ai_examples;
DROP POLICY IF EXISTS "Staff with ai_training editable delete own examples" ON public.ai_examples;

-- ===== ai_ab_tests =====
DROP POLICY IF EXISTS "Accommodation admins manage own ab tests" ON public.ai_ab_tests;
DROP POLICY IF EXISTS "Staff with ai_training editable insert own ab tests" ON public.ai_ab_tests;
DROP POLICY IF EXISTS "Staff with ai_training editable update own ab tests" ON public.ai_ab_tests;

-- ===== ai_reply_templates：寫入收斂為 super_admin（讀取政策不動） =====
DROP POLICY IF EXISTS "HQ admins manage reply templates" ON public.ai_reply_templates;
CREATE POLICY "HQ super admins manage reply templates"
  ON public.ai_reply_templates FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- ===== ai_insight_cards：寫入收斂為 super_admin（承辦人政策不動） =====
DROP POLICY IF EXISTS "Admins manage insight cards" ON public.ai_insight_cards;
CREATE POLICY "Super admins manage insight cards"
  ON public.ai_insight_cards FOR ALL TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- ===== POSTCHECK：不得殘留任何館別層／staff 層寫入政策 =====
DO $$
DECLARE leftover text;
BEGIN
  SELECT string_agg(tablename||'.'||policyname, ', ')
  INTO leftover
  FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN ('ai_prompts','ai_knowledge','ai_examples','ai_ab_tests',
                      'ai_reply_templates','ai_insight_cards')
    AND cmd <> 'SELECT'
    AND (coalesce(qual,'')||coalesce(with_check,'')) ~ '(staff_can_edit_module|hotel_admin|is_admin_or_super)';
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: 仍有寫入政策未收斂 -> %', leftover;
  END IF;
  RAISE NOTICE 'POSTCHECK OK';
END $$;
```

施工時另外在 migration 外做一次唯讀比對：收斂前後各跑一次
`select tablename, cmd, count(*) from pg_policies where tablename in (...) group by 1,2`，附上前後數字。

## 三、Rollback SQL

```sql
-- ai_prompts
CREATE POLICY "Accommodation admins manage own prompts" ON public.ai_prompts FOR ALL TO authenticated
USING ((accommodation_id IS NOT NULL) AND (user_has_role(auth.uid(), accommodation_id,'super_admin') OR user_has_role(auth.uid(), accommodation_id,'hotel_admin')))
WITH CHECK ((accommodation_id IS NOT NULL) AND (user_has_role(auth.uid(), accommodation_id,'super_admin') OR user_has_role(auth.uid(), accommodation_id,'hotel_admin')));
CREATE POLICY "Staff with ai_training editable insert own prompts" ON public.ai_prompts FOR INSERT TO authenticated
WITH CHECK ((accommodation_id IS NOT NULL) AND staff_can_edit_module(accommodation_id,'ai_training'));
CREATE POLICY "Staff with ai_training editable update own prompts" ON public.ai_prompts FOR UPDATE TO authenticated
USING ((accommodation_id IS NOT NULL) AND staff_can_edit_module(accommodation_id,'ai_training'))
WITH CHECK ((accommodation_id IS NOT NULL) AND staff_can_edit_module(accommodation_id,'ai_training'));
CREATE POLICY "Staff with ai_training editable delete own prompts" ON public.ai_prompts FOR DELETE TO authenticated
USING ((accommodation_id IS NOT NULL) AND staff_can_edit_module(accommodation_id,'ai_training'));

-- ai_knowledge（館別 admin 三條 + staff 三條，條件同上，僅換表名／cmd）
-- ai_examples（館別 admin ALL + staff 三條）
-- ai_ab_tests（館別 admin ALL + staff insert/update）
-- 施工時 rollback 檔會寫成完整逐條 SQL，不用縮寫。

-- 兩張無館別欄位的表
DROP POLICY IF EXISTS "HQ super admins manage reply templates" ON public.ai_reply_templates;
CREATE POLICY "HQ admins manage reply templates" ON public.ai_reply_templates FOR ALL TO authenticated
USING (is_admin_or_super()) WITH CHECK (is_admin_or_super());
DROP POLICY IF EXISTS "Super admins manage insight cards" ON public.ai_insight_cards;
CREATE POLICY "Admins manage insight cards" ON public.ai_insight_cards FOR ALL TO authenticated
USING (is_admin_or_super()) WITH CHECK (is_admin_or_super());
```

## 四、BEGIN…ROLLBACK 驗證（4 個，收斂後於同一交易內執行）

每個測試皆以 `set local role authenticated` + `set local request.jwt.claims` 模擬該使用者，結束一律 `ROLLBACK`，不留任何資料。

1. **hotel_admin 寫館別層 → 應被拒**：取一位真實 hotel_admin 的 user_id 與其館別，`INSERT INTO ai_knowledge(accommodation_id,title,content,category)`，預期 `new row violates row-level security policy`。
2. **ai_training=editable 的 staff 寫館別層 → 應被拒**：從 `staff_module_permissions` 取一筆 editable 的 (user_id, accommodation_id)，同樣 INSERT `ai_examples`，預期被拒。
3. **super_admin 寫全域列 → 應成功**：`INSERT INTO ai_knowledge(accommodation_id=NULL,...)` 應回 1 筆，接著 UPDATE、DELETE 同筆亦成功（確認 HQ 現有編輯流程不受影響）。
4. **super_admin 寫 ai_reply_templates / ai_insight_cards → 應成功；hotel_admin 寫同兩表 → 應被拒**（驗證 🔁 兩段沒有誤傷 HQ、確實擋住 hotel_admin）。

另加唯讀回歸：以 anon/authenticated 身分 `select count(*)` 六張表全域列，數字須與收斂前一致（prompts 4 / knowledge 10 / examples 10 / ab_tests 0 / reply_templates 3 / insight_cards 3）。

## 五、portal-ai-chat 館別過濾：先講事實

**目前這支函式沒有「這是哪一館的對話」的可靠上下文。** 實查：

- 前端 `src/components/booking-portal/PortalAIChatPanel.tsx:128` 送出的 `context` 只有 `check_in_date`、`check_out_date`、`guest_count`，**沒有 accommodation_id**。
- 函式內唯一用到 `context.accommodation_id` 的地方是 `index.ts:157` 的旅遊導引封存，且該值在目前前端呼叫下恆為 `null`。
- 這支是**平台入口的全站客服**（跨全部民宿找房），對話一開始本來就不綁單一館別；館別是使用者聊到後來才由工具查詢決定的。

所以我不會硬造一個館別判斷依據。實際要修的是：**四項設定讀取一律只取全域列**，並保留一個「呼叫端明確指定館別時才額外納入該館列」的通道（目前無人使用，等日後真的做館別客服再由前端傳入）。

### 完整 diff（`supabase/functions/portal-ai-chat/index.ts`）

```diff
+    // 館別過濾：本函式為平台全站客服，前端未提供館別上下文。
+    // 一律只讀全域列（accommodation_id IS NULL）；若呼叫端明確帶入 accommodation_id，才額外納入該館列。
+    const ctxAccId = typeof context?.accommodation_id === 'string' && UUID_REGEX.test(context.accommodation_id)
+      ? context.accommodation_id
+      : null;
+    const scopeKey = ctxAccId ?? 'global';
+    const scoped = <T extends { or: (f: string) => T; is: (c: string, v: null) => T }>(q: T): T =>
+      ctxAccId ? q.or(`accommodation_id.is.null,accommodation_id.eq.${ctxAccId}`) : q.is('accommodation_id', null);
+
-    const knowledgePromise = cached('knowledge', () => supabase
-      .from('ai_knowledge')
+    const knowledgePromise = cached(`knowledge:${scopeKey}`, () => scoped(supabase
+      .from('ai_knowledge')
       .select('title, content, priority')
-      .eq('is_active', true)
+      .eq('is_active', true))
       .order('priority', { ascending: false })
       .limit(24).then(r => r));
-    const examplesPromise = cached('examples', () => supabase
-      .from('ai_examples')
+    const examplesPromise = cached(`examples:${scopeKey}`, () => scoped(supabase
+      .from('ai_examples')
       .select('scenario, user_message, ideal_response')
-      .eq('is_active', true)
+      .eq('is_active', true))
       .limit(10).then(r => r));
-    const abTestPromise = cached('abtest', () => supabase
-      .from('ai_ab_tests')
+    const abTestPromise = cached(`abtest:${scopeKey}`, () => scoped(supabase
+      .from('ai_ab_tests')
       .select('version_a, version_b, traffic_split')
-      .eq('is_active', true)
+      .eq('is_active', true))
       .order('started_at', { ascending: false })
       .limit(1)
       .maybeSingle().then(r => r));
-    const publishedPromptPromise = cached('published_prompt', () => supabase
-      .from('ai_prompts')
+    const publishedPromptPromise = cached(`published_prompt:${scopeKey}`, () => scoped(supabase
+      .from('ai_prompts')
       .select('id, version, system_prompt, tone_rules, forbidden_topics, persona_name, status')
-      .eq('status', 'published')
+      .eq('status', 'published'))
       .order('version', { ascending: false })
       .limit(1)
       .maybeSingle().then(r => r));
```

另兩處以 `version` / `draft` 直接取 prompt 的查詢（`index.ts:788` `fetchByVersion`、`index.ts:800` draft）同樣補上 `scoped(...)`；`ai_reply_templates` 目前**沒有 accommodation_id 欄位**，無法也不需要過濾，維持原樣（其外溢風險改由第一部分把寫入權收到 super_admin 來控管）。

`CONFIG_CACHE` 的 key 全部加上 `:${scopeKey}`，避免不同館別互相污染快取——這是這段改動最容易出錯的地方，務必一起改。

### 六、測試方式（不涉及金流／訂單）

1. **型別檢查**：`npx tsgo --noEmit`（Edge Function 走 deno shims，另以 `deno check` 驗證語法）。
2. **本機呼叫 A（現況情境）**：不帶 `accommodation_id`，送「你們有哪些民宿？」與「9/20 兩人有房嗎？」各一次，比對改動前後回覆內容一致（目前資料全為全域列，過濾後結果集必須完全相同——這是主要的「沒改壞」驗證）。
3. **本機呼叫 B（館別情境）**：於測試環境暫時插入一筆館別層 `ai_knowledge`（測完刪除），帶 `accommodation_id` 呼叫應看見該筆；不帶則不得看見。此步驟需在 RLS 收斂**之前**或以 service role 建立測試列，並在同一輪結束時刪除。
4. **快取隔離**：連續三次呼叫（不帶館別 → 帶館別 → 不帶館別），確認第三次不會殘留第二次的館別內容。
5. **前台實測**：訂房入口開啟小安，問一輪找房、加購、取消政策，確認回覆風格與可用工具沒有退化，並檢查 `ai_conversation_logs` 有正常寫入。
6. 部署後觀察 Edge Function log 的 `prep_ms`，確認過濾未造成明顯延遲上升。

## 施工順序建議
夜間視窗：先 migration（含 precheck / postcheck）→ 四個 BEGIN…ROLLBACK 驗證 → 部署 portal-ai-chat → 前台實測。未經你核准前不動任何政策、資料或程式。
