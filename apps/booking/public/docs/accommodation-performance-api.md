# 場域績效 API 使用手冊（AM 儀表板 / AI 專用）

> 本文件為機器可讀的 Markdown，供 AI Agent 或 BI 工具直接讀取後呼叫 API。
> 目的：看出「某段時間做的行銷曝光 → 進了多少單、預估營收多少 → 實際住了多少、住房率多少 → 流失（取消）多少」。
> 以**日**為粒度，時間段可自訂；**一把 API Key 可看多個場域**，不帶 `venue` 就一次回全部，並附跨館合計。

---

## 1. 端點（短網址）

```
GET https://opaphdargymfyrrzvozs.supabase.co/functions/v1/perf?from=2026-06-01&to=2026-06-30&key=<API_KEY>
```

| 路徑 | 說明 |
|---|---|
| `GET /perf?from&to[&venue][&source]` | 績效資料：Key 範圍內全部場域（或 `venue` 指定），每館 `summary`+`daily`，另附跨館 `total` |
| `GET /perf/venues` | 這把 Key 能看的場域清單（`id` / `name` / `short_name`） |
| `GET /perf/version` | 服務版本（免 Key） |

- 回應 `application/json`，UTF-8；所有日期為 **Asia/Taipei**；金額 TWD 整數。
- 舊路徑 `GET /accommodation-api/performance` 仍可用（單館為主、參數 `accommodation_id`），計算邏輯與本端點完全相同。

---

## 2. 認證（三擇一）

```
?key=<API_KEY>                        ← 最簡單，適合 AI／試算表直接貼網址
x-api-key: <API_KEY>                  ← 建議
Authorization: Bearer <API_KEY>
```

- API Key 由平台總部「民宿 API 金鑰管理」發放；建立時勾選「額外館別」即為**多館 Key**（自動唯讀）。
- Key 無效／停用 → `401`。
- 流量限制：每把 Key **300 次 / 小時**（標頭 `X-RateLimit-*`；超過回 `429` + `Retry-After`）。
- 注意：`?key=` 會留在網址／瀏覽紀錄中，若是公開分享的儀表板請改用 header。

---

## 3. Query 參數

| 參數 | 必填 | 格式 | 說明 |
|---|---|---|---|
| `from` | 是 | `YYYY-MM-DD` | 起始日（含） |
| `to` | 是 | `YYYY-MM-DD` | 結束日（含），需 ≥ `from`，**最長 366 天** |
| `venue` | 否 | `id` / `名稱` / `簡稱`，逗號分隔多個 | 指定場域。可用 UUID、館名或簡稱（忽略 emoji／空白／大小寫）。**不帶 = Key 範圍內全部場域**。任一比不到或不在授權內 → `403` 並回 `available` 名單 |
| `source` | 否 | `a,b` | 只計特定 `order_source`（如 `website,kol,group_buy`），看單一行銷通路成效。不帶 = 全部來源 |
| `key` | 否 | string | API Key（header 未帶時使用） |

---

## 4. 兩條時間軸（核心觀念）

| 軸 | 歸屬日期 | 回答的問題 |
|---|---|---|
| `booked`（進單軸） | 訂單 **下單日** `order_date`（台北日期） | 這段期間行銷帶來多少單、進單時的**預估營收**、其中多少後來取消 |
| `stay`（入住軸） | 訂單 **每一晚** `check_in_date ≤ 日 < check_out_date` | 這段期間**實際入住**的房晚、營收、**住房率**，以及原本該晚要住卻取消的流失 |

- 取消率：`summary.booked.cancellation_rate_by_orders` / `cancellation_rate_by_revenue`
- 預估 vs 實際：`booked.gross_revenue`（預估）→ `booked.net_revenue`（排除取消）→ `stay.revenue`（實際入住攤提）

---

## 5. 回應結構

```json
{
  "from": "2026-06-01",
  "to": "2026-06-02",
  "currency": "TWD",
  "timezone": "Asia/Taipei",
  "source_filter": null,
  "venue_count": 2,

  "total": {
    "from": "2026-06-01", "to": "2026-06-02",
    "summary": { "booked": { "…": "跨館相加，比率重算" }, "stay": { "…": "…" }, "by_source": [ "…" ] },
    "daily": [ { "date": "2026-06-01", "booked": { "…": "…" }, "stay": { "…": "…" } }, "…" ]
  },

  "venues": [
    {
      "accommodation_id": "uuid-A",
      "name": "森山寫照",
      "short_name": "森山",
      "summary": {
        "booked": {
          "orders": 2, "gross_revenue": 7000,
          "cancelled_orders": 1, "cancelled_revenue": 3000,
          "net_orders": 1, "net_revenue": 4000,
          "collected_amount": 1000, "room_nights": 5,
          "cancellation_rate_by_orders": 0.5, "cancellation_rate_by_revenue": 0.4286
        },
        "stay": {
          "occupied_room_nights": 3, "available_room_nights": 8, "occupancy_rate": 0.375,
          "revenue": 3000, "check_ins": 1,
          "cancelled_room_nights": 1, "cancelled_revenue": 3000
        },
        "by_source": [
          { "source": "website", "orders": 1, "gross_revenue": 4000, "cancelled_orders": 0, "net_revenue": 4000 },
          { "source": "kol",     "orders": 1, "gross_revenue": 3000, "cancelled_orders": 1, "net_revenue": 0 }
        ]
      },
      "daily": [
        { "date": "2026-06-01",
          "booked": { "orders": 2, "gross_revenue": 7000, "cancelled_orders": 1, "cancelled_revenue": 3000, "net_orders": 1, "net_revenue": 4000, "collected_amount": 1000, "room_nights": 5 },
          "stay":   { "occupied_room_nights": 1, "available_room_nights": 5, "occupancy_rate": 0.2, "revenue": 1000, "check_ins": 0, "cancelled_room_nights": 1, "cancelled_revenue": 3000 } },
        { "date": "2026-06-02",
          "booked": { "orders": 0, "gross_revenue": 0, "cancelled_orders": 0, "cancelled_revenue": 0, "net_orders": 0, "net_revenue": 0, "collected_amount": 0, "room_nights": 0 },
          "stay":   { "occupied_room_nights": 2, "available_room_nights": 3, "occupancy_rate": 0.6667, "revenue": 2000, "check_ins": 1, "cancelled_room_nights": 0, "cancelled_revenue": 0 } }
      ]
    },
    { "accommodation_id": "uuid-B", "name": "…", "short_name": "…", "summary": { "…": "…" }, "daily": [ "…" ] }
  ],

  "definitions": { "timezone": "…", "booked": "…", "stay": "…", "exclusions": "…" }
}
```

- `venues[]`：每個場域各自一份 `summary` + `daily`（只屬於該場域的資料）。
- `total`：所有回傳場域相加（`daily` 逐日相加、住房率／取消率重算）。只看單館時 `total` = 該館。
- `daily` **一定補滿** `from` ~ `to` 每一天（無資料日為 0），可直接以 index 畫圖。
- 比率四捨五入至小數 4 位；分母為 0 時為 `null`。

### `GET /perf/venues` 回應

```json
{
  "venues": [
    { "id": "uuid-A", "name": "森山寫照", "short_name": "森山", "is_active": true },
    { "id": "uuid-B", "name": "雲岫", "short_name": "☁️ 雲岫", "is_active": true }
  ],
  "hint": "venue 參數可用 id、name 或 short_name，逗號分隔多館；不帶 venue 代表全部"
}
```

---

## 6. 欄位字典

### `booked`（進單軸）

| 欄位 | 意義 |
|---|---|
| `orders` | 當日下單筆數（**含**後來取消） |
| `gross_revenue` | 進單時的預估營收合計（`final_price`，**含**後來取消） |
| `cancelled_orders` / `cancelled_revenue` | 當日下單、之後被取消的筆數／金額 |
| `net_orders` / `net_revenue` | 排除取消後的筆數／金額 |
| `collected_amount` | 未取消訂單已收款合計（`paid_amount`） |
| `room_nights` | 當日下單帶來的房晚數（含取消） |
| `cancellation_rate_by_orders` | 僅 summary：`cancelled_orders / orders` |
| `cancellation_rate_by_revenue` | 僅 summary：`cancelled_revenue / gross_revenue` |

### `stay`（入住軸）

| 欄位 | 意義 |
|---|---|
| `occupied_room_nights` | 當晚被未取消訂單佔用的房數 |
| `available_room_nights` | 當晚可售房數：`room_inventory_pricing.available_rooms` → 缺列用房型 `room_count`；關房 = 0；不含包棟方案虛擬房型 |
| `occupancy_rate` | 住房率 = `occupied / available` |
| `revenue` | 實際入住營收：每張訂單 `final_price ÷ 住宿晚數` 平均攤到每晚 |
| `check_ins` | 當日入住組數（未取消） |
| `cancelled_room_nights` / `cancelled_revenue` | 原訂該晚入住但已取消的房晚／攤提金額（流失量） |

### `by_source`（僅 summary，依 `gross_revenue` 降冪）

`source`（`website`、`kol`、`group_buy`、`owlting`、`hotelnabe`、`manual`…；空值為 `unknown`）、`orders`、`gross_revenue`、`cancelled_orders`、`net_revenue`。

---

## 7. 口徑與排除規則

- 排除 `order_status = hold`（暫鎖未成立）。
- 排除測試來源 `order_source ∈ {test, test_data}`。
- 排除該館在總部「業績推播來源設定」中**關閉**的來源（與每日業績推播同口徑）。
- 包棟方案房型、或 `lock_whole_building = true` 的訂單，視為當晚**佔滿全部可售房**。
- `order_rooms` 有多房明細時以明細數量為準，否則 `room_quantity`，再否則 1 間。
- 取消判定：`order_status = cancelled`。

---

## 8. 範例

```bash
# 1. 全部場域、一檔活動期間（6/1–6/14），Key 放網址
curl -s 'https://opaphdargymfyrrzvozs.supabase.co/functions/v1/perf?from=2026-06-01&to=2026-06-14&key=<API_KEY>'

# 2. 先問這把 Key 有哪些場域
curl -s 'https://opaphdargymfyrrzvozs.supabase.co/functions/v1/perf/venues' -H 'x-api-key: <API_KEY>'

# 3. 只看兩館（用簡稱）＋ 只算官網與 KOL 來源
curl -s 'https://opaphdargymfyrrzvozs.supabase.co/functions/v1/perf?from=2026-06-01&to=2026-06-30&venue=森山,雲岫&source=website,kol' \
  -H 'x-api-key: <API_KEY>'
```

### 行銷曝光前後比較（AI 建議流程）
1. 以曝光開始日切兩段 `[前 N 天]`、`[曝光期 N 天]`，各呼叫一次。
2. 比 `total.summary.booked.orders` / `gross_revenue`（進單是否成長），再看 `venues[]` 哪一館貢獻最多。
3. 比 `cancellation_rate_by_orders`（新流量品質）。
4. 用 `daily[].stay.occupancy_rate` 畫入住軸，看曝光帶來的訂單實際住在哪幾天。
5. 用 `summary.by_source` 判斷成長來自哪個通路。

---

## 9. 錯誤碼

| HTTP | 內容 | 原因 |
|---|---|---|
| 400 | `from and to are required (YYYY-MM-DD)` / `Invalid date format…` / `'to' must be on or after 'from'` / `Date range exceeds 366 days` | 參數錯誤 |
| 400 | `venue must not be empty` / `source must not be empty` | 參數帶了但為空 |
| 401 | `Missing API key` / `Invalid or inactive API key` | 認證失敗 |
| 403 | `Unknown venue or outside this API key's scope` + `unknown[]` + `available[]` | venue 比不到或不在授權內 |
| 404 | `Not found` | 路徑錯 |
| 429 | `Rate limit exceeded` + `retry_after` | 超過 300 次/小時 |
| 500 | `{ "error": "...", "accommodation_id"?: "..." }` | 伺服器錯誤 |

---

## 10. 最小呼叫範本（JavaScript）

```js
const BASE = "https://opaphdargymfyrrzvozs.supabase.co/functions/v1/perf";
async function getPerf(apiKey, from, to, { venues = [], sources = [] } = {}) {
  const q = new URLSearchParams({ from, to });
  if (venues.length) q.set("venue", venues.join(","));
  if (sources.length) q.set("source", sources.join(","));
  const res = await fetch(`${BASE}?${q}`, { headers: { "x-api-key": apiKey } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json(); // { total, venues[], daily… }
}
```

---

## 相關連結
- 互動文件（Swagger，含舊路徑 `/accommodation-api/performance` schema）：`https://booking.lakeze.com/docs/accommodation-api-swagger.html`
- OpenAPI JSON：`https://booking.lakeze.com/docs/accommodation-api.openapi.json`
- 本手冊：`https://booking.lakeze.com/docs/accommodation-performance-api.md`
