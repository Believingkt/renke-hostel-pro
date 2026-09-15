---
name: AI 設定寫入僅限 super_admin
description: ai_prompts/ai_knowledge/ai_examples/ai_ab_tests/ai_reply_templates/ai_insight_cards 的寫入權已收斂為 super_admin，館別層與 staff 層政策不得重建
type: constraint
---

2026-09-09 收斂完成，不可回頭加回：

- `ai_prompts`、`ai_knowledge`、`ai_examples`、`ai_ab_tests`：已移除「館別管理者（hotel_admin）」與「`staff_can_edit_module(..., 'ai_training')` 員工」的 INSERT/UPDATE/DELETE 政策。只保留 super_admin 維護全域列（`accommodation_id IS NULL`）。
- `ai_reply_templates`、`ai_insight_cards`：寫入政策由 `is_admin_or_super()` 收斂為 `is_super_admin(auth.uid())`；insight cards 承辦人（`assignee_id = auth.uid()`）仍可更新自己的卡片。
- 所有 SELECT 政策維持不變（機器人與後台讀取不受影響）。
- 前端寫入 UI 僅存在 `/hq/ai-training/*`，且路由已由 `RequireHQRole allow={HQ_AI_ROLES}` 守衛。

`portal-ai-chat` 讀取 `ai_knowledge`/`ai_examples`/`ai_ab_tests`/`ai_prompts` 一律只取全域列；只有呼叫端在 `context.accommodation_id` 明確帶入館別時才額外納入該館列，且 `CONFIG_CACHE` key 必須含 scope，避免館別內容污染全站回覆。`ai_reply_templates` 無 `accommodation_id` 欄位，不做過濾。
