## 目標

- `/booking` 首頁：只保留 Hero/搜尋條 + 精選民宿介紹（AccommodationCard 區塊）。
- 新增 `/booking/search`：搜尋後跳轉的結果頁，以房型為單位的大圖卡片呈現。
- HQ 後台：每家民宿可手動覆寫「特色標籤」。

---

## 1. 資料庫

新增欄位（migration）：

```
ALTER TABLE public.accommodation_info
  ADD COLUMN feature_tags_override text[] NULL;
```

語意：`null` 或空陣列 → 用現有 facilities 自動推導；非空 → 完全以此為準。

## 2. 後台設定

在 HQ「民宿資料」編輯頁加一個「搜尋結果特色標籤」區塊：
- 預設顯示目前自動推導的標籤（灰色 chips，唯讀）
- 下方一組可勾選 + 自訂輸入的標籤池（寵物友善 / BBQ / 獨立廚房 / 泳池 / KTV / 含早餐 / 免費停車 / WiFi / 桌遊 / 親子，再 +「自訂」）
- 留空 = 自動；勾選後寫入 `feature_tags_override`

（找現有 accommodation 編輯表單擴一個欄位，不新增獨立頁面。）

## 3. /booking 首頁簡化

`src/pages/BookingPortal.tsx`：
- 保留：Hero 圖、PortalSearchBar、登入/會員按鈕、精選民宿區塊（直接列出 accommodations，不再依搜尋過濾／不再呼叫 availability index）
- 移除：`handleSearch` 裡的 inventory 計算、`aggregatedAccs`/`filtered` 對搜尋結果的依賴
- 「搜尋」按鈕改成：把 `checkIn / checkOut / adults / children / rooms / q` 組成 query string，`navigate('/booking/search?...')`

## 4. /booking/search 新頁

新檔 `src/pages/BookingSearchResults.tsx`，掛在 `App.tsx` `booking/search` 路徑。

頁面構成：
- 頂部：精簡搜尋摘要列（日期 / 人數 / 房數，可點開重編後重新搜尋）
- RoomFilterBar（沿用現有元件：排序 / 價格 / 容量 / 地區 / 民宿）
- 結果卡片清單：以 **房型** 為單位

每張卡：
```
┌─────────────────────────────┐
│         房型主圖（16:10）       │
│  [特色標籤 chips overlay 左下]   │
├─────────────────────────────┤
│ 房型名稱                 NT$總價 │
│ 民宿名 · 地區            /夜 起 │
│ 👥 2人 · 📐 26m² · 🛏 雙人床    │
└─────────────────────────────┘
```

點卡 → 進入對應 `/booking/:accId?...` 或 `/booking/villa/:accId?...`（沿用現有導向邏輯）。

森山保持現有特殊邏輯（包區方案、不卡散客庫存）。

## 5. 範圍外（這次不做）

- 結果卡評分（user 確認不顯示）
- 地圖檢視、收藏按鈕
- 排序動畫、骨架屏（依專案規範）

---

### 技術細節

- 共用 `RoomTypeCard` 重新做大圖版型，或在新頁新增 `SearchRoomCard`（建議後者，舊卡仍在民宿頁用）
- Availability 計算（沿用現有 handleSearch 的 inventory + template 價格邏輯）整段搬到 `BookingSearchResults` 的 `useEffect`
- 後台覆寫標籤要同步反映在首頁 AccommodationCard 的 `feature_tags` 與結果頁的卡片
- query string 解析支援空值（缺日期則退回明天 + 後天）
