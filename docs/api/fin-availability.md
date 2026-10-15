# fin-availability — Fin（Intercom AI 客服）跨館查房況

供 Intercom Fin 的 Data connector 使用：輸入少、回應扁平。計算邏輯與 `all-availability` 同源（`_shared/availability.ts` 的 `buildAvailability`）。

## 端點

```
GET https://<project>.supabase.co/functions/v1/fin-availability
```

### 認證
- Header `x-api-key: <FIN_API_KEY>`（常數時間比對）。
- 伺服器未設定 `FIN_API_KEY` → 500；未帶或不符 → 401。
- 獨立金鑰，**不可**使用 `PLATFORM_MASTER_API_KEY`。

### 環境變數
| 名稱 | 說明 |
|---|---|
| `FIN_API_KEY` | 新增。Fin 專用金鑰，於 Supabase Dashboard 設定 |
| `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` | 既有（平台內建） |

### Query 參數
| 參數 | 必填 | 說明 |
|---|---|---|
| `check_in` | 是 | 入住日 `YYYY-MM-DD` |
| `check_out` | 是 | 退房日 `YYYY-MM-DD`，須晚於入住日；最多 14 晚 |
| `guests` | 否 | 人數，整數 ≥ 1，預設 2；只列 `capacity >= guests` 的房型（capacity 未設定視為符合） |
| `region` | 否 | 對 `region_1` 或 `region_2` 部分比對（不分大小寫） |
| `accommodation` | 否 | 對館名 `name` 或 `short_url_alias` 部分比對 |
| `ping` | 否 | `ping=1` 只驗金鑰，回啟用館數（Test connection 用） |

`region`／`accommodation` 會移除 `, ( ) * % \ : . " '` 等字元後再比對，最長 50 字。

### 館別範圍
與前台入口列表（`BookingPortal`）相同：`accommodation_info.is_active = true` 且 `show_on_portal = true`。

### 判定與價格
- 計算區間為入住日至**退房前一晚**。
- 可訂：住宿期間每一晚 `is_available` 且 `remaining > 0`。
- `remaining`：各晚剩餘間數的最小值。
- `total_price`：各晚 `price` 加總；任一晚無價 → `total_price: null`、`avg_nightly_price: null`、`price_note: "請洽客服"`。
- `avg_nightly_price`：`total_price / nights` 四捨五入。
- `results` 只放可訂房型，依 `total_price` 升冪（無價排最後），最多 10 筆。
- `unavailable_count`：符合人數但不可訂的房型數。
- `message`：`共 N 間可訂`（N 為全部可訂房型數，可能大於 results 筆數）或 `這段日期沒有符合的房型`。

### booking_url
與前台館別頁實際讀取的參數一致（`BookingVilla` 讀 `checkIn`／`checkOut`／`adults`）：
```
https://booking.lakeze.com/<short_url_alias>?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&adults=<guests>
```
無 alias 的館：`https://booking.lakeze.com/booking/villa/<accommodation_id>?…`（同參數）。

### 回應範例
```json
{
  "check_in": "2026-11-07",
  "check_out": "2026-11-09",
  "nights": 2,
  "guests": 6,
  "currency": "TWD",
  "results": [
    {
      "accommodation_id": "uuid",
      "accommodation_name": "森山寫照",
      "region": "宜蘭縣 冬山鄉",
      "room_type_id": "uuid",
      "room_type_name": "四人包棟",
      "capacity": 8,
      "available": true,
      "remaining": 1,
      "total_price": 25600,
      "avg_nightly_price": 12800,
      "booking_url": "https://booking.lakeze.com/senshan?checkIn=2026-11-07&checkOut=2026-11-09&adults=6"
    }
  ],
  "unavailable_count": 3,
  "message": "共 1 間可訂"
}
```

### 錯誤
一律回 `{ "error": "繁中說明" }`：
| HTTP | 情況 |
|---|---|
| 400 | 缺日期、日期格式錯、退房 ≤ 入住、超過 14 晚、guests 不合法 |
| 401 | 未帶或錯誤的 `x-api-key` |
| 405 | 非 GET／OPTIONS |
| 429 | 同一金鑰每分鐘超過 60 次（記憶體計數，每個 edge isolate 各自計算） |
| 500 | 未設定 `FIN_API_KEY`，或查詢失敗 |

CORS：允許 `x-api-key`，方法 `GET, OPTIONS`。

## curl 範例

測試連線：
```bash
curl -s "https://<project>.supabase.co/functions/v1/fin-availability?ping=1" \
  -H "x-api-key: $FIN_API_KEY"
# → {"ok":true,"accommodations":42}
```

查宜蘭 11/7–11/9、6 人：
```bash
curl -s -G "https://<project>.supabase.co/functions/v1/fin-availability" \
  -H "x-api-key: $FIN_API_KEY" \
  --data-urlencode "check_in=2026-11-07" \
  --data-urlencode "check_out=2026-11-09" \
  --data-urlencode "guests=6" \
  --data-urlencode "region=宜蘭"
```
