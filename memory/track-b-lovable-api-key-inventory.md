# Track B 交接：LOVABLE_API_KEY 使用盤點（供 Nokimi 改直連用）

盤點基準：工作區程式碼（Lovable main，最後 commit c55f951b4「修正 Google 評論假預設值」，2026-09-14 前）
路徑皆相對於 `supabase/functions/`

## A. 真正呼叫 Lovable AI Gateway 的 12 檔（10 支 function + 2 個 _shared helper）

呼叫方式全部一致（OpenAI 相容格式）：
```
POST https://ai.gateway.lovable.dev/v1/chat/completions
Authorization: Bearer ${LOVABLE_API_KEY}
Content-Type: application/json
{ model, reasoning_effort: "none", max_tokens, messages:[{role:"system"|"user"|"assistant", content}] }
→ 讀取 data.choices[0].message.content
```
唯一例外：`speech-to-text` 打的是 `/v1/audio`（語音轉文字），model `openai/gpt-4o-mini-transcribe`。

| 檔案 | 行 | 端點 | 模型（靜態字串） |
|---|---|---|---|
| `_shared/lineLlm.ts` | 87 | /v1/chat/completions | google/gemini-3.6-flash |
| `_shared/travelerGuide.ts` | 137 | /v1/chat/completions | google/gemini-3.6-flash |
| `accommodation-ai-chat/index.ts` | 309 | /v1/chat/completions | （見該檔） |
| `ai-ops-insights/index.ts` | 115 | /v1/chat/completions | （見該檔） |
| `generate-accommodation-short-name/index.ts` | 41 | /v1/chat/completions | （見該檔） |
| `generate-seo-suggestions/index.ts` | 43 | /v1/chat/completions | （見該檔） |
| `remarketing-copy/index.ts` | 54 | /v1/chat/completions | （見該檔） |
| `speech-to-text/index.ts` | 72 | **/v1/audio** | openai/gpt-4o-mini-transcribe |
| `translate-content/index.ts` | 150 | /v1/chat/completions | （見該檔） |
| `traveler-tagging/index.ts` | 158 | /v1/chat/completions | （見該檔） |
| `trip-recommend/index.ts` | 281 | /v1/chat/completions | （見該檔） |
| `trip-translate/index.ts` | 93 | /v1/chat/completions | （見該檔） |

全體模型字串出現次數（靜態 grep）：
- google/gemini-3.6-flash ×5
- google/gemini-2.5-flash ×3
- google/gemini-3-flash-preview ×2
- google/gemini-3.7-flash ×1
- openai/gpt-4o-mini-transcribe ×1

注意：靜態 grep **沒有**找到 `anthropic/claude-*` 字串。規劃書提到 Claude Sonnet/Haiku，若確有使用，應是動態組字串或在其他路徑，請以你端 grep 為準。

### 兩個 _shared helper 的呼叫鏈

**`_shared/lineLlm.ts`**
- 匯出：`askLlm(sb, { text, history? }) → Promise<LlmAnswer{text, promptVersion}>`、`logLineConversation(...)`、`interface LlmAnswer`
- 內部：`buildSystemPrompt(sb)` 從 DB 讀 prompt（含 version）+ 附加 LINE 通道規則；history 取最後 6 則；max_tokens 700；**失敗永不 throw，回傳 FALLBACK_TEXT**
- 被誰用：僅 `_shared/lineButler.ts:12`（`import { askLlm, logLineConversation }`）→ LINE AI 管家路徑

**`_shared/travelerGuide.ts`**
- 匯出：`runGuideTurn({ messages, known?, lang? }) → GuideTurnResult{reply, extracted, done, offtopic}`、`generateGuideTripCards(...)`、`buildGuideSystemPrompt`、`isGuideTrigger`、`normalizeAttrs`、`mergeAttrs`、`filledCount`、`isComplete`、`scenarioFromAttrs`、`archiveGuideAttributes`、型別 `GuideLang`/`GuideAttrs`/`GuideTurnResult`
- 內部：messages 取最後 20 則、每則截 2000 字；system prompt = `buildGuideSystemPrompt(lang)` + 已知屬性 JSON；max_tokens 800；回覆期望 JSON `{reply, extracted, done, offtopic}`，解析失敗則整段當 reply；**失敗會 throw（帶 status）**
- `generateGuideTripCards` 另外以 service role 呼叫 `${SUPABASE_URL}/functions/v1/trip-recommend`（內部 function 對 function）
- 被誰用：`portal-ai-chat/index.ts`、`traveler-guide/index.ts`

## B. 引用 LOVABLE_API_KEY 但「不打任何 Lovable 端點」的 12 檔

這 12 支都是 Email／通知類，實際寄信走 Resend（`RESEND_API_KEY` 或 `RESEND_API_KEY_LAKEZE`）。
`LOVABLE_API_KEY` 在其中**只作為存在性檢查**（`if (!LOVABLE_API_KEY) throw / return false`），是歷史殘留 guard，改直連時可直接移除該檢查，不影響行為。

| 檔案 | 用法 |
|---|---|
| `auth-email-hook/index.ts` | **例外**：L146/L200 取 key，L210 `verifyWebhookRequest({ secret: apiKey })` → 把 LOVABLE_API_KEY 當 Supabase Auth Email Hook 的 webhook secret。自有 Supabase 上請改成獨立的 `AUTH_EMAIL_HOOK_SECRET` 並在 Auth Hooks 設定同值。 |
| `cleanup-unverified-members/index.ts` | L33 存在性檢查（與 RESEND 併檢） |
| `health-check/index.ts` | L89-93 存在性檢查 |
| `notify-order-status-change/index.ts` | L59 存在性檢查；另呼叫內部 `send-line-push` |
| `owlting-change-notify/index.ts` | L110 存在性檢查 |
| `owlting-fillup-issue/index.ts` | L190 存在性檢查 |
| `process-email-queue/index.ts` | L82 取 key（請確認後續用途，疑為 guard） |
| `remarketing-send/index.ts` | L113/147 存在性檢查 |
| `report-frontend-error/index.ts` | L54 取 key（請確認後續用途，疑為 guard） |
| `send-daily-performance/index.ts` | L153-155 存在性檢查（throw） |
| `send-resend-email/index.ts` | L285-286 存在性檢查（throw），實際寄信用 RESEND_API_KEY_LAKEZE ?? RESEND_API_KEY |
| `send-team-invite/index.ts` | L5 取 key（請確認後續用途，疑為 guard） |

## C. 改直連的建議（供參考，不強制）

1. 新增 `_shared/llm.ts`：單一 `chatCompletion({ model, messages, maxTokens, reasoningEffort })`，內部依 `LLM_MODE=gateway|direct` 切換：
   - gateway：維持現行 URL + LOVABLE_API_KEY（切換前在 Lovable Cloud 繼續可用）
   - direct：Gemini 走 Google 的 OpenAI 相容端點 `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`（`Authorization: Bearer ${GOOGLE_AI_API_KEY}`，model 去掉 `google/` 前綴），request/response 形狀不變，改動最小；OpenAI 語音走 `https://api.openai.com/v1/audio/transcriptions`。
2. 12 支 AI function 逐一改為呼叫 `_shared/llm.ts`；B 組 12 支只需刪除 guard（auth-email-hook 換 secret 變數名）。
3. Secrets 新增：`LLM_MODE`、`GOOGLE_AI_API_KEY`、`OPENAI_API_KEY`（及若有 `ANTHROPIC_API_KEY`）、`AUTH_EMAIL_HOOK_SECRET`。
