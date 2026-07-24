
## Task 1 — 多住宿下訂 RLS 回讀驗證（需你手動測，我提供腳本 + 檢查清單）

RLS 回讀錯誤只發生在「已登入會員 + `.insert().select()`」。上一輪已加 `Members can view their own orders`，理論上所有民宿都能通過（policy 不綁 accommodation）。但為確認沒有其他隱藏 policy 或 trigger 干擾，建議你用下面清單各測一次：

- 森山寫照（已修）
- 雲岫（villa 包棟）
- 哈庫納（villa）
- 旅行日-DAIDODO（外幣）
- 任一散客型民宿（例如 Olivia）

每家測「LINE 登入會員 → 下訂 ATM → 驗證回傳 order_number 有出現」即可。若任一家仍出錯，把 Network payload 貼給我。

我這輪會加一支 `debug-order-rls` Edge Function，你可以直接呼叫模擬「當前 session」對 orders 做一次乾式 insert，快速定位是哪個欄位／trigger 擋掉。

## Task 2 — 訂單狀態變更通知（Email + LINE）

### 觸發條件
在 `orders` 表新增 `AFTER UPDATE` trigger，於下列欄位變化時寫入 `order_status_change_events` 隊列：

- `payment_status`：`pending_payment` → `paid` / `deposit_paid` / `refunded`
- `order_status`：`pending` → `confirmed` / `cancelled`
- （可選）入住當日 08:00 用 pg_cron 掃描發送「今日入住提醒」

### 派送層
新增 Edge Function `notify-order-status-change`：
1. 從隊列讀取事件
2. 撈 order + platform_member + line binding
3. 依事件類型套用模板（付款完成 / 訂單取消 / 入住提醒）
4. 有 email → 透過現有 `send-booking-confirmation`／`send-cancellation-email` 或新增 `send-transactional-order-email`
5. 有 LINE 綁定 → 呼叫現有 `send-line-push`，target 直接指定會員的 `line_user_id`
6. 寫入 `notifications` 表留站內紀錄
7. 全部去重（同一事件同一 channel 只送一次）

### DB 變更
- `order_status_change_events`：`order_id`, `event_type`, `old_value`, `new_value`, `sent_email_at`, `sent_line_at`, `sent_inapp_at`, `created_at`, `error`
- Trigger：`orders_status_change_notify_trigger`（AFTER UPDATE）
- Cron：每分鐘掃 pending 事件呼叫 Edge Function

### 會員偏好
在 `platform_members` 加 `notify_email boolean default true`, `notify_line boolean default true`；派送時尊重旗標。（若你不需要偏好開關就跳過，直接全發。）

## Task 3 — RLS 自動化測試

新增 `supabase/functions/_shared/rls_policy_test.ts`（Deno test），covers：

1. **Members can view their own orders**
   - Sign in as member A → insert order with `member_id = A.id` → `.select()` 應成功
   - Sign in as member B → 查 A 的 order → 應為 0 rows
   - Anon → 查 A 的 order → 應為 0 rows

2. **同型 policy 巡檢**（同一支測試涵蓋）
   - `member_favorites`：owner 可讀自己的，別人的讀不到
   - `member_points` / `member_point_transactions`
   - `member_coupon_distributions`
   - `member_recent_views`
   - `member_saved_cards`

3. **回歸保護**：測試會列出所有 policy 名稱包含 "own" 或 "member" 的 SELECT policy，若任何一項對匿名可見即 fail（防止未來誤開）

用法：`supabase--test_edge_functions` 可執行；同時放入 CI 建議腳本 `scripts/run-rls-tests.md`。

## 執行順序

1. 先做 Task 3（純加檔、風險低）→ 立刻能跑，順便二次驗證上一輪的 policy 修復
2. 再做 Task 2（Migration + Edge Function）
3. 最後給 Task 1 的手動測試腳本 + `debug-order-rls` helper

## 技術細節

- LINE：沿用 `send-line-push` 的 `targets` 模式，直接把會員 `line_user_id` 傳入，不走 event_type 廣播（避免推給所有訂閱者）。
- Email：優先呼叫 `send-transactional-email` 內建流；若專案已有 `send-booking-confirmation` 樣板則沿用同一寄件網域。
- 去重：透過 `sent_*_at` 欄位 + `UNIQUE(order_id, event_type)` 保護重放。
- Trigger 只在真正的狀態欄位改變時寫入（`OLD.payment_status IS DISTINCT FROM NEW.payment_status`）避免每次備註修改都爆量。
- RLS 測試會用 `service_role` 建臨時會員 → 各自登入取 JWT → 用該 JWT 呼叫 PostgREST 直接驗結果，測完清理。
