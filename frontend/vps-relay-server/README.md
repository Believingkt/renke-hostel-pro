# VPS Static IP Relay Server

用於將 Supabase Edge Function 的外部 API 請求透過固定 IP 的 VPS 轉發。

## 架構

```
Edge Function (動態 IP) → VPS Relay (固定 IP) → 外部 API (IP 白名單)
```

## 安裝步驟

### 1. SSH 登入 GoDaddy VPS

```bash
ssh root@你的VPS_IP
```

### 2. 安裝 Node.js（如尚未安裝）

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

### 3. 建立專案目錄

```bash
mkdir -p /opt/relay-server
cd /opt/relay-server
```

### 4. 上傳檔案

將 `server.js` 和 `package.json` 上傳到 `/opt/relay-server/`

### 5. 安裝依賴並啟動

```bash
npm install
```

### 6. 設定環境變數

```bash
cp .env.example .env
nano .env
```

修改 `RELAY_TOKEN` 為一個高強度隨機字串（用於驗證請求來源）：
```bash
# 生成隨機 token
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 7. 使用 PM2 持久化運行

```bash
npm install -g pm2
pm2 start server.js --name relay-server
pm2 save
pm2 startup
```

### 8. 設定防火牆（僅開放必要端口）

```bash
# 只允許 Supabase Edge Function 的流量（或開放 3456 端口）
ufw allow 3456/tcp
ufw enable
```

### 9. （建議）設定 HTTPS

使用 Let's Encrypt + Nginx 反向代理：

```bash
apt install nginx certbot python3-certbot-nginx
```

Nginx 設定 (`/etc/nginx/sites-available/relay`):
```nginx
server {
    listen 80;
    server_name relay.你的網域.com;

    location / {
        proxy_pass http://127.0.0.1:3456;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/relay /etc/nginx/sites-enabled/
certbot --nginx -d relay.你的網域.com
systemctl restart nginx
```

## 設定 Supabase Secrets

部署完成後，在 Lovable 專案中設定：

- `STATIC_IP_PROXY_URL`: `https://relay.你的網域.com`（或 `http://VPS_IP:3456`）
- `STATIC_IP_PROXY_TOKEN`: 你在 `.env` 中設定的 token

## 測試

```bash
curl -X POST http://localhost:3456/health
# 應返回: {"status":"ok","timestamp":"..."}

curl -X POST http://localhost:3456/relay \
  -H "Content-Type: application/json" \
  -H "X-Relay-Token: 你的token" \
  -H "X-Target-Url: https://httpbin.org/post" \
  -H "X-Forward-Header-Custom: test" \
  -d '{"hello":"world"}'
```

## 查看日誌

```bash
pm2 logs relay-server
```
