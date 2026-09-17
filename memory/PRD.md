# Lakeze 人客多 — Emergent 工作區 PRD / 決策紀錄

## 專案
- 民宿／villa 訂房平台（前台訂房+會員 / PMS 後台+AI 管家 / 總部 HQ），React 19 + Vite 5 + TS + Supabase（目前為 Lovable Cloud 代管）
- GitHub：Believingkt/renke-hostel-pro（main 由 Lovable 持續同步，為回退點）
- 規模：前端 973 檔／約 30.5 萬行；supabase/functions 181 支；migrations 953 個
- 工作區佈局：原 repo 根目錄被 Emergent 放到 `/app/frontend/`；`/app/backend` 為未使用的 FastAPI 模板

## 對口
- Kenneth（老闆）、Nokimi（工程師，規劃書作者）

## 已確認決策（Nokimi 2026-09-16）
- 架構：**monorepo**（packages/shared + apps/{booking,pms,hq}），shared 不做版本化發布；多對話多工靠 Fork + `.env` 的 `ACTIVE_APP`
- 本對話範圍：**Track A = 前端拆分 + 去 Lovable 化（程式碼層）**，後端維持 Lovable Cloud 不動；前端繼續用現有 VITE_SUPABASE_URL / PUBLISHABLE_KEY
- Track B（AI Gateway 改直連、181 支 CLI 部署）與 Track C（自有 Supabase 搬遷）由 Nokimi 自行處理，不在此對話進行；交接文件見 `memory/track-b-lovable-api-key-inventory.md`
- Pilot：拆完先把 HQ 部署到 Emergent 網址驗證，DNS 不切

## 開工規矩
- 分支：所有變更只推 `feat/monorepo-split`（Save to GitHub），不碰 main；永不 Force Push；衝突選 Create Branch & Push 並通知 Nokimi
- 搬移不改任何業務邏輯：純搬檔 + 改 import
- `lovableproject.com` 判斷改環境變數時，保留原條件為 fallback
- Fork 多對話：待 Track A 合回 main 且三 app 各自可 build 後才開；之後各對話只改自己 `apps/` 目錄，`packages/shared` 只由主對話改
- Day 1 做完先停，貼 diff 摘要（搬了哪些目錄、改了哪些 import、bundle 大小前後）給 Nokimi 看過再進 Day 2
- 本對話不需要任何 Supabase access token / service role key

## 已完成
- 2026-09-15：環境接通（package.json 加 `start`、vite.config server 設 port 3000/allowedHosts、.yarnrc ignore-engines）；前台預覽與後端 /api 均正常
- 2026-09-16：Track B 交接盤點完成

## 已知限制（平台）
- Emergent GitHub 整合為單向（Emergent → GitHub）；**現有對話無法 Pull 最新 main**，只能在新任務開始時匯入
- Save to GitHub 推送的是 Emergent 佈局（repo 根 = frontend/ + backend/ ...），與 Lovable main 的「src/ 在根」不同，合回 main 時需處理目錄搬移
