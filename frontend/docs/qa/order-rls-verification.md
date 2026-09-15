# 多住宿下訂 RLS 回讀驗證清單

## 背景

上一輪修復：新增 `orders` policy `Members can view their own orders`，讓 LINE / 會員登入後 `.insert().select()` 不再觸發 RLS 42501。

本清單用於驗證此修復在所有住宿都成立。

## 測試步驟

在每一家民宿的下訂頁面各執行一次：

1. 以 LINE 登入（或 Email 註冊會員後登入）
2. 選日期、房型、加購 → 走到單頁結帳
3. 選擇 ATM 付款 → 送出訂單
4. **預期**：顯示訂單編號，跳轉到匯款頁；DevTools Network 中 `POST /rest/v1/orders` 為 201

## 涵蓋清單

- [ ] 森山寫照（villa，已修復當作 baseline）
- [ ] 雲岫（villa 包棟）
- [ ] 哈庫納（villa）
- [ ] 旅行日-DAIDODO（外幣）
- [ ] 任一散客民宿（例如 Olivia）

## 若某家仍失敗

用 debug helper 快速定位：

```bash
# 取得會員 JWT（從瀏覽器 Application → LocalStorage → sb-...-auth-token 的 access_token）
JWT="eyJhbGciOi..."

curl -X POST 'https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/debug-order-rls' \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d @failing-payload.json
```

回傳會分開告訴你：
- `ok: true` → RLS 沒問題，錯誤在別處
- `error_code: 42501` → 仍有 RLS policy 擋
- `error_code: P0001` → trigger（庫存/價格）擋
- `error_message` / `error_hint` → PostgreSQL 提供的原因

## RLS 自動化測試

`supabase/functions/rls-policy/index.test.ts` 涵蓋：

- 會員 A `.insert().select()` 可回讀自己的訂單
- 會員 B 不能看到 A 的訂單
- 匿名不能列 orders
- `member_favorites` 只有 owner 能讀
- 回歸掃描：所有含 "member"/"own" 的 SELECT policy 都不能對 anon 開放

執行：

```bash
supabase functions test rls-policy
# 或用 lovable 工具：
#   supabase--test_edge_functions({ functions: ["rls-policy"] })
```

執行需要 `.env` 內有 `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`。
