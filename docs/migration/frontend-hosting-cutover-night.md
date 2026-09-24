# 切換當晚前端主機方案（單一 app → Vercel）— 2026-09-24

> 背景：Track A 三個 app 尚未拆完（不在切換範圍）。今晚上線的前端 = `feat/migration-prep` 的單一 app（已指向新專案）。
> 選 Vercel 而不是 Cloudflare Pages 的理由：各民宿自訂網域多半是 apex（沒有 www），Cloudflare Pages 的 apex 要求 DNS zone 在 Cloudflare；Vercel 用 A 記錄 `76.76.21.21` 就能接任何 DNS 商的 apex。

## 0. 三個問題——已於 9/24 21:30 確認
1. 有自訂網域的民宿：**0 間**（`accommodations.custom_domain` 全空）。各館用的是 `lakeze.com` 子網域（sensaninn / tiansong-villa / oliviaboutiquehotel / traveldays），都在同一個 zone。
2. DNS 由 Nokimi 管（Squarespace 帳號，改記錄需以 service@lakeze.com Google 驗證）。
3. DNS 商 **Squarespace**。7 筆要切的 A 記錄 TTL 已於 21:30 降到 **300 秒**（Custom）；sensaninn 原本鎖在「Domain Connect to Entri」預設組，已刪組並重建為自訂記錄（同組的 kol A + `_lovable.kol` TXT 已原樣重建，kol 屬別的專案不切）。

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
- `booking.lakeze.com`、`pms.lakeze.com`、`hq.lakeze.com`
- `sensaninn.lakeze.com`、`tiansong-villa.lakeze.com`、`oliviaboutiquehotel.lakeze.com`、`traveldays.lakeze.com`
- **不要加** `lakeze.com` / `www.lakeze.com`——根網域指的是 Cloudflare（162.159.142.117 / 172.66.2.113），不是 Lovable，今晚不動
加完 Vercel 會顯示每個網域要設的 DNS 值；**今天先不改 DNS**，只是讓 Vercel 端準備好、SSL 會在 DNS 生效後自動簽。

## 2. 當晚 DNS 切換（runbook §3 步驟 10 的具體內容）
Squarespace → lakeze.com → DNS → Custom records。全部都是把 **A 記錄的 IP 從 `185.158.133.1` 改成 `76.76.21.21`**，TTL 維持 300：

| # | NAME | 現值 | 改成 |
|---|---|---|---|
| 1 | booking | 185.158.133.1 | 76.76.21.21 |
| 2 | pms | 185.158.133.1 | 76.76.21.21 |
| 3 | hq | 185.158.133.1 | 76.76.21.21 |
| 4 | sensaninn | 185.158.133.1 | 76.76.21.21 |
| 5 | tiansong-villa | 185.158.133.1 | 76.76.21.21 |
| 6 | oliviaboutiquehotel | 185.158.133.1 | 76.76.21.21 |
| 7 | traveldays | 185.158.133.1 | 76.76.21.21 |

**不動**：`@`、`www`（Cloudflare）、`blog`、`kol`（別的 Lovable 專案）、所有 MX / TXT / NS（Google Workspace、Resend、SendGrid）。

順序：先改 booking → 無痕視窗驗證 → 再改 pms、hq → 最後四個館。每筆存檔都會要求 Google 驗證一次。
驗證每個網域：`dig +short <網域> @8.8.8.8` 回 76.76.21.21、瀏覽器打開、Network 面板看 supabase 請求打到 `opaphdargymfyrrzvozs.supabase.co`、Vercel Domains 頁面 SSL 顯示 valid。

DNS 全部切完後 → 到 Lovable 專案 Settings → Domains **移除這 7 個網域**，讓還抓著舊快取的使用者打到舊站時得到 404，而不是寫進已凍結的舊 DB。

## 3. 回退
7 筆 A 記錄改回 `185.158.133.1`（TTL 300，5 分鐘內生效）；若已在 Lovable 移除網域，要先加回去。Vercel 專案不用刪。

## 4. 切換後
- Track A 合併後，同一個 Vercel 專案改成三個專案（booking / pms / hq 各自 root directory），DNS 不用再動
- 移除 Redirect URLs 裡的 `*.vercel.app`
- `VITE_PREVIEW_HOSTS` 加 `.vercel.app` 讓 preview deployment 被當預覽網域
