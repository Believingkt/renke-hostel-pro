# 遷移前需要 Kenneth 提供 / 執行的事項

> 依《人客多系統遷移工作計畫》會議決議整理。Day 1 早上前完成打 ✔ 的項目，遷移才能準時開始。
> 所有金鑰請用密碼管理器分享或加密檔案，**不要貼 LINE**。

## A. 帳號與付款（Day 0 前）

| # | 事項 | 說明 | 完成 |
|---|---|---|---|
| A1 | Supabase 組織用的 Email | Nokimi 用這個 Email 申請 Supabase Organization；Kenneth 為 Owner，Nokimi 為 Admin | ☐ |
| A2 | Supabase 付款方式 | Pro US$25/月 + Medium compute（US$60/月）；PITR US$100/月 可選。信用卡由 Kenneth 在 Supabase 後台自行輸入 | ☐ |
| A3 | Emergent 工作區 credits ≥ 500 | 目前約 7,800，足夠；確認不會被其他專案用掉 | ☐ |
| A4 | Google AI Studio API key（Gemini） | 取代 Lovable AI gateway；用 Kenneth 的 Google 帳號建立，設每日用量上限 | ☐ |
| A5 | OpenAI API key | 語音轉文字（gpt-4o-mini-transcribe）；程式已有 `OPENAI_API_KEY` 名稱，若舊環境已設可直接沿用 | ☐ |

## B. 第三方後台存取（Day 1–3）

| # | 事項 | 用途 | 完成 |
|---|---|---|---|
| B1 | Google Cloud Console → OAuth Client（會員 Google 登入） | 新增 Authorized redirect URI：`https://<NEW_REF>.supabase.co/auth/v1/callback`；把 Client ID / Secret 給 Nokimi 設進 Supabase Auth | ☐ |
| B2 | Google Business Profile OAuth Client | 同上，加新 callback：`https://<NEW_REF>.supabase.co/functions/v1/google-business-profile-oauth-callback` | ☐ |
| B3 | ~~TapPay Portal~~ | 9/22 確認：notify URL 每筆交易帶入，**不需改後台**；Webhook 若後台有設，切換後由 Nokimi 檢查 | ☑ |
| B4 | LINE Developers（LINE Login、Messaging API 管家 OA）、LINE Pay 商家後台 | 改 Webhook URL；確認 Nokimi 有 Admin | ☐ |
| B5 | Meta for Developers（Facebook Login） | 確認 Redirect URI（前台網域，通常不用改） | ☐ |
| B6 | DNS 管理（lakeze.com 及各民宿自訂網域） | Day 3 把 TTL 降到 300；Day 4 晚上改指向；Nokimi 需要能登入或 Kenneth 在線 | ☐ |
| B7 | Resend 後台 | 確認 lakeze.com 網域驗證狀態、API key 沿用 | ☐ |
| B9 | SendGrid 帳號（Inbound Parse → `owlting-email-ingest`） | 誰持有帳號？需把 Inbound Parse 的目的 URL 改到新專案；找不到帳號則奧丁丁 Email 收單在切換後會斷 | ☐ |
| B10 | Lovable 訂閱保留 | 舊專案要撐到奧丁丁切換完成（對方說 10 月上旬）+ 回退保留期，**至少到 10/20 不要退訂** | ☐ |
| B11 | Supabase org 加入 | Nokimi 先邀 Kenneth 的 Email 進 org 當 Owner，切換後再正式移轉；請提供要用的 Email | ☐ |
| B8 | Lovable 後台 Cloud → Secrets | Nokimi 逐一抄出約 60 個 secret（Kenneth 給 Lovable 專案 Editor 權限即可） | ☐ |

## C. 合作方聯絡窗口（Day 1 通知、Day 4 前確認）

| # | 合作方 | 要對方做的事 | 窗口 | 完成 |
|---|---|---|---|---|
| C1 | ~~TapPay~~ | 不需通知（9/22 確認） | | ☑ |
| C2 | 旭海 HotelNabe | 改訂單接收 URL | Victor | ☑ 9/22 已切，實測 OK |
| C3 | 奧丁丁 OwlTing | 改 Channel Manager 回呼 URL | 小洪 / Frank | 已通知；對方佈署流程需到 10 月上旬，期間走舊→新轉發 |
| C4 | ~~KOL 平台~~ | `kol-webhook` 是我方對外送，不需對方改 | | ☑ |
| C5 | 外部 API 使用者（若有人直接串 `accommodation-api` / `all-availability`） | 通知新 base URL | | ☐ |

## D. 對內公告（Kenneth 發）

| # | 時間 | 內容 | 完成 |
|---|---|---|---|
| D1 | Day 0 晚上 | 團隊：即日起不要進 Lovable 改東西或 Publish；系統照常使用 | ☐ |
| D2 | Day 3 | 官網 / LINE：週四 23:00–02:00 系統維護，期間暫停訂房 | ☐ |
| D3 | Day 4 16:00 | 依驗收結果宣布當晚切換或延後 | ☐ |
| D4 | Day 5 早上 | 切換完成；會員登入若遇密碼問題走「忘記密碼」即可（不另行公告密碼事） | ☐ |

## E. 決定事項（需要 Kenneth 拍板）

| # | 問題 | 建議 | 決定 |
|---|---|---|---|
| E1 | Supabase 區域 | Tokyo（ap-northeast-1），與台灣延遲最低 | ☐ |
| E2 | 是否買 PITR（US$100/月） | 第一個月建議買，穩定後可關 | ☐ |
| E3 | `mcp` 函式與 `@lovable.dev/mcp-js`（Lovable 的 MCP 工具，5 個 tool） | 切換後是否還需要？不需要就整包移除 | ☐ |
| E4 | API 文件內的 `docs_url`（目前指向 renke-hostel-pro.lovable.app） | 改為 booking.lakeze.com | ☐ |
