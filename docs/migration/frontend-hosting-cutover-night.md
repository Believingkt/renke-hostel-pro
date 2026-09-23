# 切換當晚前端主機方案（單一 app → Vercel）— 2026-09-24

> 背景：Track A 三個 app 尚未拆完（不在切換範圍）。今晚上線的前端 = `feat/migration-prep` 的單一 app（已指向新專案）。
> 選 Vercel 而不是 Cloudflare Pages 的理由：各民宿自訂網域多半是 apex（沒有 www），Cloudflare Pages 的 apex 要求 DNS zone 在 Cloudflare；Vercel 用 A 記錄 `76.76.21.21` 就能接任何 DNS 商的 apex。

## 0. 16:00 Go / No-Go 前要有答案的三個問題（Kenneth）
1. 有自訂網域的民宿有幾間、清單是什麼？（`select name, custom_domain from accommodations where custom_domain <> ''`）
2. 這些網域的 DNS 誰在管（Kenneth 統一管？還是各民宿自己？）— 各民宿自己管的，今晚改不到，只能先留在 Lovable，切換後前端會壞，需事先通知或延後
3. lakeze.com 的 DNS 商是哪家、TTL 是否已降到 300

任一答案是「不知道」→ 今晚只切 booking / pms / hq 三個主網域，自訂網域列為切換後第一天處理，並先通知那幾間民宿。

## 1. 下午準備（Nokimi，約 1 小時，不影響線上）
```bash
cd ~/dev/lakeze-booking && git checkout feat/migration-prep && git pull
# 確認 .env 指向 opaphdargymfyrrzvozs
grep VITE_SUPABASE_URL .env
npm run build            # 產出 dist/（含 seo-prerender 的靜態 HTML 與 sitemap）
```
建 `vercel.json`（repo 根，之後 commit）：
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    { "source": "/assets/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
  ]
}
```
（Vercel 先找實體檔案再套 rewrite，所以 prerender 出來的 HTML 不會被蓋掉。）

部署（用 Kenneth 的 Vercel 帳號最好，沒有就先用 Nokimi 的，切換後再轉 team）：
```bash
npm i -g vercel
vercel login
vercel --prod --yes          # Framework: Other；Output dir: dist；專案名 lakeze-web
```
拿到 `https://lakeze-web-xxx.vercel.app` 後：
- 用這個網址跑一次昨天的測試清單（首頁、房型照片、Email 登入、後台、HQ）
- Supabase Auth → URL Configuration → Redirect URLs 加 `https://lakeze-web-*.vercel.app/**`（測試用，切換後移除）
- Google OAuth client 的 Authorized JavaScript origins 不用加（redirect 走 supabase.co）

Vercel 專案 → Settings → Domains 逐一加：
- `booking.lakeze.com`、`pms.lakeze.com`、`hq.lakeze.com`、`lakeze.com`、`www.lakeze.com`
- 每個民宿自訂網域（apex + www）
加完 Vercel 會顯示每個網域要設的 DNS 值；**今天先不改 DNS**，只是讓 Vercel 端準備好、SSL 會在 DNS 生效後自動簽。

## 2. 當晚 DNS 切換（runbook §3 步驟 10 的具體內容）
| 網域 | 記錄 | 值 |
|---|---|---|
| booking / pms / hq / www.lakeze.com | CNAME | `cname.vercel-dns.com` |
| lakeze.com（apex） | A | `76.76.21.21` |
| 各民宿自訂網域（apex） | A | `76.76.21.21`（把原本指向 Lovable 的 A 記錄換掉） |
| 各民宿 www | CNAME | `cname.vercel-dns.com` |

順序：先改 booking → 無痕視窗驗證 → 再改 pms、hq → 最後自訂網域。TTL 300 → 每個 5 分鐘內生效。
驗證每個網域：`dig +short <網域>`、瀏覽器打開、Network 面板看 supabase 請求打到 `opaphdargymfyrrzvozs.supabase.co`、Vercel Domains 頁面 SSL 顯示 valid。

## 3. 回退
DNS 改回 Lovable 原值（A 記錄 185.158.133.1 / CNAME 原值——**改之前先截圖每一筆現值**）。Vercel 專案不用刪。

## 4. 切換後
- Track A 合併後，同一個 Vercel 專案改成三個專案（booking / pms / hq 各自 root directory），DNS 不用再動
- 移除 Redirect URLs 裡的 `*.vercel.app`
- `VITE_PREVIEW_HOSTS` 加 `.vercel.app` 讓 preview deployment 被當預覽網域
