# 純唯讀調查計畫：lakeze 工作區 / 資料庫 / GitHub / 殘留網址（A–H）

一次性的唯讀調查，產出一份 A～H 分節報告，每項附實際指令／查詢的原文輸出，最後附「已查證／無法查證／部分查證」對照表。
全程只讀不寫：不改動任何檔案、不 git 寫入、不觸發 Save to GitHub、不 Publish、不跑 migration、不對任何資料庫寫入、不讀取或輸出任何金鑰／密碼／token 的實際值。

## 這份調查給誰看
提出調查的維運負責人，用來釐清：目前工作區有哪些未存檔改動、前後端實際連到哪個 Supabase、GitHub 與自動部署現況、新舊資料庫與舊網址是否仍有殘留與運作。

## 交付內容（單一報告，分 A–H 節）
- **A 工作區現況**：`git status` 全部未存檔檔案 + 每檔 `git diff` 原文；能對應到產生該改動的對話指令者一併註明（只列事實，不評論、不建議存檔／還原、不做任何處理）。目前 branch、HEAD hash 與時間、與 `origin/production` 的 ahead/behind。
- **B 資料庫連線**：從設定檔／環境變數讀出前端與 Edge Function 實際連到的 Supabase project ref，並明確回答是否等於 `dmafqwfynatdvnaeovhz`；環境變數「名稱」清單（標註有值／空值，不輸出值）；說明本任務能否對正式庫下 SQL、用何連線角色、是否 BYPASSRLS、能否 `SET ROLE authenticated`。
- **C GitHub 與自動部署**：所有 branch 清單、`production` 與 `main`（或主要分支）差異筆數；`production` 最近 40 筆 commit 原文；Lovable 機器人（名稱含 lovable／gpt-engineer）最新 5 筆 commit 的 branch 與時間，並回答 2026-10-05 後是否仍有 Lovable commit；`.github/workflows/` 所有檔案完整原文；deploy workflow 最近執行紀錄（若查得到）；`scripts/release/`、`docs/release/` 清單與 supabase-release 文件原文。
- **D 新舊資料庫殘留**：全碼（含 `supabase/`）搜尋 `dmafqwfynatdvnaeovhz` 的每一處路徑／行號／原文；`20261005150000_fix_hotelnabe_trigger_new_project_url.sql` 完整原文與其修改內容說明；pg_proc／trigger／cron 掃 `supabase.co`（需正式庫唯讀權限）。
- **E 寫死網址**：搜尋 `lovable.app`、`lovableproject`、`emergentagent.com`、`lakeze.com` 的路徑／行號／原文；特別標出 TapPay 3DS 導回、TapPay／OwlTing／HotelNabe webhook、登入／重設密碼導回、通知信連結。
- **F 舊網站運作**：以 `curl -I` 與 GET 連 `renke-hostel-pro.lovable.app`、`pms.lakeze.com`、`hq.lakeze.com`，列 HTTP 狀態碼與轉址目的地；若舊站仍回應，抓主要 JS 內 `supabase.co` 判斷其 project ref。
- **G 資料庫現況（需正式庫唯讀權限）**：`schema_migrations` 最新 15 筆並與 repo migrations 比對；`cron.job` 全列與兩支 job 近 5 次執行；5 支指定函式 `pg_get_functiondef` 的 md5／長度／prosecdef。
- **H 平台功能**：專案記憶／規則檔／系統指示機制現況與原文（在不洩漏機密前提下）；發布管理「Run a review」是否含安全掃描。

## 可行性分界（依已確認條件）
- **可執行（執行模式下）**：A、B（讀設定與環境變數名稱）、C、D12/D13、E、F，以及 H23 中屬於本工作區檔案的規則／記憶檔。
- **標註「無法查證」**：所有需「正式 Supabase 直連唯讀」的項目 —— C5、D14、G19–22。原因：本環境僅有本機 Postgres（供 fixture 測試），無正式庫 psql 直連通道；且依指示不得尋找／讀取正式庫連線字串或金鑰。
- **可能「部分查證」**：C10（deploy workflow 執行紀錄，取決於是否能從 repo／本地讀到）、C8（Lovable commit，取決於 commit 中繼資料）、H24（發布面板安全掃描，屬平台端，必要時以 support 管道確認或標註無法查證）。

## 流程
核准本計畫 → 切回一般（執行）模式 → 依 A→H 逐節執行唯讀指令／查詢並收集原文輸出 → 彙整成報告與對照表 → 停下等待回覆，不提出、不執行任何修正。

## 呈現方式
純文字報告，依 A～H 分節；每項先列實際指令／查詢，再貼原文輸出（長輸出保留關鍵片段並標明截斷）；金鑰／密碼／token 僅列名稱不列值；結尾附每項狀態對照表（已查證／無法查證／部分查證）。

## 實作階段
- **Phase 1（本次執行）**：完成上述可執行項目的 A～H 唯讀調查與完整回報；需正式庫直連的項目標註「無法查證」並說明原因。
- **Phase 2（本次不做）**：若之後取得正式庫唯讀連線授權，再補 C5／D14／G19–22 的實際查詢結果。
- **Phase 3（本次不做）**：依調查結論規劃任何修正（殘留網址、舊站、部署設定等）——屬後續另案，需另行核准。

## 假設（未詢問即採用的決定）
- 「跑完 A～H 一次完整回報」＝在切回執行模式後單輪完成，過程維持純唯讀。
- 需正式庫直連的項目無可用唯讀通道，一律標「無法查證」；不嘗試建立或尋找任何正式庫連線字串／金鑰。
- F 的外部 URL 探測使用唯讀 HTTP 方法（`curl -I` / GET），不送出任何會造成寫入或狀態改變的請求。
- A 的「對應到產生改動的對話指令」以本任務對話可追溯者為限；無法對應者標示「來源不明」，不臆測。
- H24 若非本工作區可讀資訊（屬平台發布面板功能），以「無法從工作區查證」標註，必要時建議改由平台支援管道確認。
- 報告以繁體中文輸出。
