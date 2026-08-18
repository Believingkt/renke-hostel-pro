# 業績通報「多模板」機制（方案 B）

## 目標
同一館別（例：森山）可建立多份業績通報模板（例：完整版、行銷總部版、加盟版），
每個 LINE 群組各自訂閱一份模板；Email 仍固定只寄「完整版」，且一天一封不重複。

## 資料結構

新增 `performance_notification_templates`
- `accommodation_id`、`name`（模板名稱，例：行銷總部版）
- `body`（模板內容，沿用現有 `{變數}` 語法）
- `is_primary`（唯一一份＝Email 用的完整版）
- `include_modified_notice`（是否附加「今日歷史訂單異動」提醒）
- `display_order`、`enabled`
- 每館建表時把現有 `performance_notification_settings.email_template` 搬進來當 `is_primary` 那筆，舊資料零落差。

`line_push_targets` 新增 `performance_template_id`（可為空）
- 空 = 沿用該館 `is_primary` 模板（＝目前行為，不動到既有群組）。

## 發送邏輯（send-daily-performance）

1. 每館一樣只算一次數據，產生變數表（效能不變）。
2. Email：只用 `is_primary` 模板渲染，一館一天一封（沿用現有 `performance_notification_sent_log` 去重）。
   → 同館設多份模板也不會多寄 Email。
3. LINE：查該館訂閱 `daily_performance` 的群組，依 `performance_template_id` 分組，
   每組渲染各自模板後推播（呼叫 `send-line-push` 時帶明確 `targets`，避免重覆解析）。
   `send-line-push` 既有「同分鐘同訊息同對象」去重仍有效。

## 設定 UI

「民宿業績通報」頁（`TeamNotification`）
- 每館展開後新增「通報模板」清單：新增／複製／改名／編輯內容／設為 Email 完整版／排序。
- 模板編輯器沿用現有變數提示 chips 與預覽（測試發送可選模板）。
- 每份模板下方顯示「目前訂閱此模板的 LINE 群組」，並附連結直接跳到 LINE OA 該群組設定。

「LINE OA」頁（`TeamLineOA`）
- 群組編輯中若勾選 `daily_performance`，出現「使用模板」下拉（該館模板清單，預設＝完整版）。
- 下拉旁加「前往模板管理」連結與一行說明，兩頁互相可跳轉。

## 需要你確認的盲點

1. **「今日歷史訂單異動」提醒**：目前寫死附加在信件與推播結尾。多模板後建議做成每模板開關（預設開）。
2. **多館群組**：一個 LINE 群組可同時訂閱多館。模板是綁「館別」的，
   建議規則＝群組對每館各記一個模板選擇；若某館沒選就用該館完整版。若要簡化成「群組只綁單一模板」請說。
3. **Email 收件者**：目前固定 `service@lakeze.com`，不隨模板改變；完整版永遠是 `is_primary`。
4. **模板刪除／停用**：有群組還在用時不允許直接刪，需先改綁或自動退回完整版（預設：擋下並提示）。
5. **加盟變數**：非加盟館若在模板誤用 `{加盟…}` 變數，會渲染成 0；是否要在編輯器直接隱藏該類變數。
6. **LINE 單則 5000 字上限**：完整版加上異動清單有機會超過；超長時自動截斷或分則發送（建議分則）。
7. **去重副作用**：兩份模板若內容渲染後完全相同、又推同一群組，會被同分鐘去重擋掉一則（屬預期行為）。
8. **權限**：模板管理沿用業績通報頁現有權限（HQ／管理層），不開放一般 staff。

## 技術備註
- 一次 migration：建表＋GRANT＋RLS（讀寫比照 `performance_notification_settings`）＋回填 primary 模板＋`line_push_targets` 新欄位。
- `send-daily-performance` 只改「渲染與發送」段落，統計查詢完全不動。
