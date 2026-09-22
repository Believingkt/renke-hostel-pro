#!/usr/bin/env bash
# 驗證信實測：觸發重設密碼信 → 走 Send Email hook → auth-email-hook → Resend
# 用法：./test-recover-email.sh you@example.com
set -eu
EMAIL="${1:?email}"
curl -s -X POST https://opaphdargymfyrrzvozs.supabase.co/auth/v1/recover \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wYXBoZGFyZ3ltZnlycnp2b3pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MTczOTUsImV4cCI6MjEwNTQ5MzM5NX0.3htdWH00IBzn8Doub0bV6Ckt4EsEvCzI1BMCV-f3oZY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\"}" -w "\nHTTP %{http_code}\n"
echo "→ 檢查信箱：寄件者應為 Resend 設定的 lakeze.com 網域，連結網域應為 booking.lakeze.com"
