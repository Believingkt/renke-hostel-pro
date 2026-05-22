## 目標

把 CreateOrderDialog 內 hardcoded 的「6 間房 / 雙人 3 / 四人 3」改成讀 DB；任意房型結構都能正確顯示與限制；營運分析的「總可售房數」改為動態。

## 設計原則（避免動到既有民宿）

新增的 DB 欄位**不 backfill** Sensan/Hakuna/Olivia。讀取邏輯改為：

```
exclusive_total  = acc.exclusive_total_rooms ?? (isHakuna ? 7 : isOlivia ? 9 : 6)
exclusive_break  = acc.exclusive_room_breakdown ?? 既有 hardcoded 對照
daily_capacity   = acc.daily_capacity ?? 6
```

→ 三家舊民宿欄位留空 = 100% 走 fallback，**行為跟現在一字不差**。

## 改動範圍

### 1. DB（migration）
- `accommodation_info` 新增 3 欄（全 nullable）：
  - `exclusive_total_rooms int` — 包棟總房數
  - `exclusive_room_breakdown jsonb` — 例 `[{ "room_type_id": "...", "name": "雙人房", "count": 3 }]`
  - `daily_capacity int` — 每日總可售房數（分析用）

### 2. UI：新增「房型與包棟設定」卡片區塊
位置：HQ 該民宿 → 訂房設定頁（既有「訂房設定」分頁下方），不是新增民宿對話框。
（新增民宿時房型還沒建，無法選；建好房型再來這裡設定。）

**A. 卡片清單佈局：**
```
┌─ 房型與包棟設定 ──────────────────────────┐
│  每日總可售房數  [  6  ]  房                │
│  ─────────────────────────────────────── │
│  包棟設定                                  │
│  ┌──────────────────────────────────┐    │
│  │ ☑ 雙人房（room_type）            │    │
│  │   包含 [ 3 ] 間  · 容納 2 人     │    │
│  ├──────────────────────────────────┤    │
│  │ ☑ 四人房                          │    │
│  │   包含 [ 3 ] 間  · 容納 4 人     │    │
│  ├──────────────────────────────────┤    │
│  │ ☐ 六人房                          │    │
│  │   （未納入包棟）                   │    │
│  └──────────────────────────────────┘    │
│  包棟總計：6 間 / 18 人  [自動加總]        │
│  [儲存]                                    │
└────────────────────────────────────────────┘
```

新增/刪除 `room_types` 自動出現在清單，沒勾的不算包棟。

### 3. CreateOrderDialog（核心邏輯）
- 移除 hardcoded `MAX_DOUBLE_ROOMS / MAX_QUAD_ROOMS / MAX_TOTAL_ROOMS`
- 改讀 `accommodation.exclusive_room_breakdown` 動態渲染欄位
- 提示文字改成：「包棟已鎖定 6 間房（雙人房 0 間、四人房 0 間、六人房 0 間）」← 自動依設定組字串
- 沒設定 → fallback 到原本 3 家的 hardcoded 常數

### 4. 營運分析（Analytics）
- `Total Available Nights = daily_capacity × days`
- 沒設定 → 維持 6

## 不動的部分

- room_types 結構不動（沿用 `is_exclusive_package` / `is_bound_to_exclusive` / `capacity` / `room_count`）
- Sensan/Hakuna 庫存判斷規則完全不動（已上鎖）
- 散客訂單流程不動

## 風險

| 風險 | 緩解 |
|---|---|
| 既有三家被影響 | 不寫入 DB，永遠走 fallback |
| 包棟總人數計算錯 | 用設定的 `count × room_type.capacity` 加總 |
| 用戶誤刪房型導致設定殘留 | 載入時過濾無效 room_type_id |

## 工作量

約 1 個工作週期：1 migration + 1 新 UI 元件 + CreateOrderDialog 改造 + Analytics 1 行公式。
