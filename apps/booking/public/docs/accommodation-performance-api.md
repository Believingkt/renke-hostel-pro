# 場域績效 API 使用手冊（AM 儀表板 / AI 專用）

> 本文件為機器可讀的 Markdown，供 AI Agent 或 BI 工具直接讀取後呼叫 API。
> 目的：看出「某段時間做的行銷曝光 → 進了多少單、預估營收多少 → 實際住了多少、住房率多少 → 流失（取消）多少」。以**日**為粒度，時間段可自訂，每把 API Key 只回傳自己場域的資料。

---

## 端點

```
GET https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/accommodation-api/performance
```

- Method：`GET`
- 回應：`application/json`，UTF-8
- 時區：所有日期為 **Asia/Taipei**（UTC+8）
- 幣別：TWD，金額皆為整數

---

## 認證

每個請求必帶 API Key（二擇一）：

```
x-api-key: <ACCOMMODATION_API_KEY>
```
或
```
Authorization: Bearer <ACCOMMODATION_API_KEY>
```

- API Key 由平台總部在「民宿 API 金鑰管理」發給，**一把 Key 綁定一個主場域**；若總部另外授權多館範圍（scopes），可用 `accommodation_id` 參數指定該範圍內的館。
- Key 無效／停用 → `401`。
- 流量限制：每把 Key **300 次 / 小時**（回應標頭 `X-RateLimit-*`；超過回 `429` 並附 `Retry-After` 秒數）。

---

## Query 參數

| 參數 | 必填 | 格式 | 說明 |
|---|---|---|---|
| `from` | 是 | `YYYY-MM-DD` | 起始日（含） |
| `to` | 是 | `YYYY-MM-DD` | 結束日（含），需 ≥ `from`，**區間最長 366 天** |
| `accommodation_id` | 否 | `uuid` 或 `uuid,uuid` | 指定一或多個館。必須全部在 Key 的授權範圍內，否則整批 `403` 並列出 `out_of_scope`。**帶此參數時回應改為 `accommodations` 陣列**；未帶則回 Key 主場域的單館物件 |
| `source` | 否 | `a,b` | 只計特定 `order_source`（如 `website,kol,group_buy`），用來看單一行銷通路成效。未帶 = 全部來源 |

---

## 兩條時間軸（核心觀念）

| 軸 | 歸屬日期 | 回答的問題 |
|---|---|---|
| `booked`（進單軸） | 訂單 **下單日** `order_date`（台北日期） | 這段期間行銷帶來多少單、進單時的**預估營收**、其中多少後來取消 |
| `stay`（入住軸） | 訂單 **每一晚** `check_in_date ≤ 日 < check_out_date` | 這段期間**實際入住**的房晚、營收、**住房率**，以及原本該晚要住卻取消的流失 |

> 取消率看 `summary.booked.cancellation_rate_by_orders` / `cancellation_rate_by_revenue`；
> 「預估 vs 實際」看 `booked.gross_revenue`（預估）對 `booked.net_revenue`（排除取消）與 `stay.revenue`（實際入住攤提）。

---

## 回應結構

### 單館（未帶 `accommodation_id`）

```json
{
  "accommodation_id": "uuid",
  "from": "2026-06-01",
  "to": "2026-06-02",
  "currency": "TWD",
  "timezone": "Asia/Taipei",
  "source_filter": null,
  "summary": {
    "booked": {
      "orders": 2,
      "gross_revenue": 7000,
      "cancelled_orders": 1,
      "cancelled_revenue": 3000,
      "net_orders": 1,
      "net_revenue": 4000,
      "collected_amount": 1000,
      "room_nights": 5,
      "cancellation_rate_by_orders": 0.5,
      "cancellation_rate_by_revenue": 0.4286
    },
    "stay": {
      "occupied_room_nights": 3,
      "available_room_nights": 8,
      "occupancy_rate": 0.375,
      "revenue": 3000,
      "check_ins": 1,
      "cancelled_room_nights": 1,
      "cancelled_revenue": 3000
    },
    "by_source": [
      { "source": "website", "orders": 1, "gross_revenue": 4000, "cancelled_orders": 0, "net_revenue": 4000 },
      { "source": "kol",     "orders": 1, "gross_revenue": 3000, "cancelled_orders": 1, "net_revenue": 0 }
    ]
  },
  "daily": [
    {
      "date": "2026-06-01",
      "booked": { "orders": 2, "gross_revenue": 7000, "cancelled_orders": 1, "cancelled_revenue": 3000, "net_orders": 1, "net_revenue": 4000, "collected_amount": 1000, "room_nights": 5 },
      "stay":   { "occupied_room_nights": 1, "available_room_nights": 5, "occupancy_rate": 0.2, "revenue": 1000, "check_ins": 0, "cancelled_room_nights": 1, "cancelled_revenue": 3000 }
    },
    {
      "date": "2026-06-02",
      "booked": { "orders": 0, "gross_revenue": 0, "cancelled_orders": 0, "cancelled_revenue": 0, "net_orders": 0, "net_revenue": 0, "collected_amount": 0, "room_nights": 0 },
      "stay":   { "occupied_room_nights": 2, "available_room_nights": 3, "occupancy_rate": 0.6667, "revenue": 2000, "check_ins": 1, "cancelled_room_nights": 0, "cancelled_revenue": 0 }
    }
  ],
  "definitions": { "timezone": "...", "booked": "...", "stay": "...", "exclusions": "..." }
}
```

### 多館（帶 `accommodation_id`）

```json
{
  "from": "...", "to": "...", "currency": "TWD", "timezone": "Asia/Taipei",
  "source_filter": ["website", "kol"],
  "definitions": { "...": "..." },
  "accommodations": [
    { "accommodation_id": "uuid-A", "summary": { "...": "..." }, "daily": [ "..." ] },
    { "accommodation_id": "uuid-B", "summary": { "...": "..." }, "daily": [ "..." ] }
  ]
}
```

- `daily` **一定補滿** `from` ~ `to` 每一天（沒有資料的日子為 0），可直接以陣列 index 畫圖。
- 比率欄位四捨五入至小數 4 位；分母為 0 時為 `null`。

---

## 欄位字典

### `booked`（進單軸，每日 / summary）

| 欄位 | 意義 |
|---|---|
| `orders` | 當日下單筆數（**含**後來取消） |
| `gross_revenue` | 進單時的預估營收合計（`final_price`，**含**後來取消） |
| `cancelled_orders` / `cancelled_revenue` | 當日下單、之後被取消的筆數／金額 |
| `net_orders` / `net_revenue` | 排除取消後的筆數／金額 |
| `collected_amount` | 未取消訂單的已收款合計（`paid_amount`） |
| `room_nights` | 當日下單帶來的房晚數（含取消） |
| `cancellation_rate_by_orders` | 僅 summary：`cancelled_orders / orders` |
| `cancellation_rate_by_revenue` | 僅 summary：`cancelled_revenue / gross_revenue` |

### `stay`（入住軸，每日 / summary）

| 欄位 | 意義 |
|---|---|
| `occupied_room_nights` | 當晚被未取消訂單佔用的房數 |
| `available_room_nights` | 當晚可售房數：`room_inventory_pricing.available_rooms` → 缺列時用房型 `room_count`；關房 = 0；不含包棟方案的虛擬房型 |
| `occupancy_rate` | 住房率 = `occupied / available` |
| `revenue` | 實際入住營收：每張訂單 `final_price ÷ 住宿晚數`，平均攤到每一晚 |
| `check_ins` | 當日入住組數（未取消） |
| `cancelled_room_nights` / `cancelled_revenue` | 原訂該晚入住但已取消的房晚／攤提金額（流失量） |

### `by_source`（僅 summary，依 `gross_revenue` 降冪）

| 欄位 | 意義 |
|---|---|
| `source` | `order_source`（`website`、`kol`、`group_buy`、`owlting`、`hotelnabe`、`manual`…；空值顯示為 `unknown`） |
| `orders` / `gross_revenue` / `cancelled_orders` / `net_revenue` | 該來源在進單軸的數字 |

---

## 口徑與排除規則

- 排除 `order_status = hold`（暫鎖未成立）。
- 排除測試來源 `order_source ∈ {test, test_data}`。
- 排除該館在總部「業績推播來源設定」中**關閉**的來源（與每日業績推播同一口徑）。
- 包棟方案房型、或 `lock_whole_building = true` 的訂單，視為當晚**佔滿全部可售房**。
- `order_rooms` 有多房明細時以明細數量為準，否則用 `room_quantity`，再否則算 1 間。
- 取消判定：`order_status = cancelled`。

---

## 範例

### 1. 看一檔活動期間（6/1–6/14）的成效

```bash
curl -s 'https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/accommodation-api/performance?from=2026-06-01&to=2026-06-14' \
  -H 'x-api-key: <ACCOMMODATION_API_KEY>'
```

### 2. 只看官網＋KOL 兩個通路

```bash
curl -s '.../accommodation-api/performance?from=2026-06-01&to=2026-06-14&source=website,kol' \
  -H 'x-api-key: <ACCOMMODATION_API_KEY>'
```

### 3. 多館 Key 一次比較兩館

```bash
curl -s '.../accommodation-api/performance?from=2026-06-01&to=2026-06-30&accommodation_id=<UUID_A>,<UUID_B>' \
  -H 'x-api-key: <ACCOMMODATION_API_KEY>'
```

### 4. 行銷曝光前後比較（AI 建議流程）

1. 以曝光開始日切兩段：`[前 N 天]` 與 `[曝光期 N 天]`，各呼叫一次。
2. 比較 `summary.booked.orders` / `gross_revenue`（進單是否增加）。
3. 比較 `summary.booked.cancellation_rate_by_orders`（新流量品質）。
4. 用 `daily[].stay.occupancy_rate` 畫入住軸，看曝光帶來的訂單實際住在哪幾天。
5. 用 `summary.by_source` 判斷成長來自哪個通路。

---

## 錯誤碼

| HTTP | 內容 | 原因 |
|---|---|---|
| 400 | `from and to are required (YYYY-MM-DD)` | 缺參數 |
| 400 | `Invalid date format, expected YYYY-MM-DD` | 日期格式錯 |
| 400 | `'to' must be on or after 'from'` | 區間顛倒 |
| 400 | `Date range exceeds 366 days (got N)` | 區間過長 |
| 400 | `accommodation_id must not be empty` / `source must not be empty` | 參數帶了但為空 |
| 401 | `Missing API key` / `Invalid or inactive API key` | 認證失敗 |
| 403 | `One or more accommodation_id values are outside this API key's scope` + `out_of_scope[]` | 指定了非授權館 |
| 429 | `Rate limit exceeded` + `retry_after` | 超過 300 次/小時 |
| 500 | `{ "error": "..." }` | 伺服器錯誤 |

---

## 給 AI 的最小呼叫範本（JavaScript）

```js
const BASE = "https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/accommodation-api";
async function getPerformance(apiKey, from, to, opts = {}) {
  const q = new URLSearchParams({ from, to });
  if (opts.accommodationIds?.length) q.set("accommodation_id", opts.accommodationIds.join(","));
  if (opts.sources?.length) q.set("source", opts.sources.join(","));
  const res = await fetch(`${BASE}/performance?${q}`, { headers: { "x-api-key": apiKey } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}
```

---

## 相關連結

- 互動文件（Swagger）：`https://<你的官網網域>/docs/accommodation-api-swagger.html`
- OpenAPI JSON：`https://<你的官網網域>/docs/accommodation-api.openapi.json`（含 `/performance` 完整 schema）
- 本手冊：`https://<你的官網網域>/docs/accommodation-performance-api.md`
- 服務版本：`GET https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/accommodation-api/version`（免 Key）
