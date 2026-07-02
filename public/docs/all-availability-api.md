# 全民宿庫存 API（AI / BI 專用）

供 AI Agent 或 BI 系統一次取得**多間民宿**的房型庫存、價格與包棟方案。使用單一 master API key 認證。

---

## 端點

```
GET https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/all-availability
```

- Method：`GET`
- Content-Type：回應為 `application/json`
- CORS：全開放

---

## 認證

所有請求必須帶上 master API key，兩種方式擇一：

```
x-api-key: <PLATFORM_MASTER_API_KEY>
```

或

```
Authorization: Bearer <PLATFORM_MASTER_API_KEY>
```

- 金鑰對應環境變數 `PLATFORM_MASTER_API_KEY`。
- 缺失或錯誤：回傳 `401 { "error": "Invalid or missing master API key" }`。
- 金鑰只有一把，代表**整個平台**的讀取權限；請妥善保管，僅存放於伺服器端。

---

## Query 參數

| 參數 | 必填 | 說明 |
|------|------|------|
| `from` | ✅ | 起始日期 `YYYY-MM-DD`（含當日） |
| `to` | ✅ | 結束日期 `YYYY-MM-DD`（含當日） |
| `accommodation_ids` | ❌ | 逗號分隔的民宿 UUID 清單；未帶則回傳全部民宿 |
| `include` | ❌ | 逗號分隔，可選 `room_types`、`packages`。預設 `room_types,packages` |

限制：
- `to` 必須 ≥ `from`
- 區間最多 **60 天**（含頭尾），超過回傳 `400`

---

## 回應格式

```json
{
  "from": "2026-07-05",
  "to": "2026-07-10",
  "currency": "TWD",
  "accommodations": [
    {
      "id": "uuid",
      "name": "森山民宿",
      "room_types": [
        {
          "id": "uuid",
          "name": "雙人房",
          "capacity": 2,
          "is_exclusive_package": false,
          "days": [
            {
              "date": "2026-07-05",
              "is_available": true,
              "available_rooms": 3,
              "price": 3200,
              "price_2_meals": 3600,
              "price_3_meals": 4000,
              "is_holiday": false
            }
          ]
        }
      ],
      "packages": [
        {
          "id": "uuid",
          "name": "包棟方案 A",
          "numeric_code": 101,
          "base_price": 28000,
          "room_type_ids": ["uuid", "uuid"],
          "is_active": true
        }
      ]
    }
  ]
}
```

欄位重點：

- `room_types[].days[]` 為逐日陣列，長度等於 `from`～`to` 天數。
- `available_rooms`：已扣除有效訂單（`hold` / `pending` / `confirmed` / `checked_in`）與包棟鎖定的**剩餘可售數**；退房當日不計佔用。
- `price`：解算後每日房價（含 pricing template 的季節/週間/假日/週末 tier 與 room_overrides）。**若 tier 不可售則為 `null`**。
- `price_2_meals` / `price_3_meals`：含 2 餐 / 3 餐方案價，可能為 `null`。
- `is_holiday`：該日期是否為該民宿設定的公休/假日。
- `packages[].numeric_code`：包棟方案的數字代碼，供外部系統比對。

---

## 錯誤碼

| Status | 意義 |
|--------|------|
| `400` | 參數錯誤（缺 from/to、格式錯、超過 60 天） |
| `401` | Master API key 缺失或無效 |
| `405` | 非 GET 請求 |
| `500` | 伺服器錯誤（含 `PLATFORM_MASTER_API_KEY` 未設定） |

---

## 範例：cURL

```bash
curl -G 'https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/all-availability' \
  -H "x-api-key: $PLATFORM_MASTER_API_KEY" \
  --data-urlencode 'from=2026-07-05' \
  --data-urlencode 'to=2026-07-10' \
  --data-urlencode 'include=room_types,packages'
```

指定民宿：

```bash
curl -G 'https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/all-availability' \
  -H "x-api-key: $PLATFORM_MASTER_API_KEY" \
  --data-urlencode 'from=2026-07-05' \
  --data-urlencode 'to=2026-07-10' \
  --data-urlencode 'accommodation_ids=uuid-a,uuid-b'
```

## 範例：Node.js (fetch)

```js
const url = new URL('https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/all-availability');
url.searchParams.set('from', '2026-07-05');
url.searchParams.set('to', '2026-07-10');

const res = await fetch(url, {
  headers: { 'x-api-key': process.env.PLATFORM_MASTER_API_KEY },
});
const data = await res.json();
```

## 範例：Python (requests)

```python
import os, requests

r = requests.get(
    "https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/all-availability",
    headers={"x-api-key": os.environ["PLATFORM_MASTER_API_KEY"]},
    params={"from": "2026-07-05", "to": "2026-07-10"},
    timeout=30,
)
r.raise_for_status()
data = r.json()
```

---

## 使用建議（給 AI Agent）

1. 一次查詢區間建議 ≤ 30 天，可避免回應過大。
2. 需要跨民宿比價時，直接使用單次呼叫的 `accommodations[]` 陣列即可，不需重複呼叫。
3. 判斷「當日可訂」條件：`days[].is_available === true && available_rooms > 0 && price !== null`。
4. 包棟方案的實際庫存需檢查 `room_type_ids` 內每一房型當日 `available_rooms` 是否都 > 0。
5. 429/5xx 請以指數退避重試（建議 500ms → 1s → 2s，最多 3 次）。

---

## 相關

- 單一民宿 AI 對話 API：`/functions/v1/accommodation-ai-chat`（使用 `x-api-key: acc_ai_...` 的民宿專屬金鑰）
- 本 API 僅供讀取；下訂請走各民宿之訂房流程。
