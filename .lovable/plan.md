## 目標

修正 `/admin` 訂房/建立訂單/後台切換相關頁面在手機（360–390px）上的重疊、溢出、按鈕消失、選單無法完整顯示等問題。只調整前端呈現，不動業務邏輯與 DB。

## 涵蓋範圍

1. 頂欄與側邊欄（切換民宿、選單、通知）
2. `/admin/orders` 訂單列表（快速篩選、進階篩選、頁面操作按鈕、分頁）
3. 建立訂單 / 建立保留單 / 編輯訂單 Dialog
4. `/admin/orders/:id` 訂單詳情（頂部動作列、內部區塊）

不動範圍：其他頁面深度改造、業務邏輯、桌面版 UI（僅在 md: 以下生效）。

## 主要改動

### 1) 頂欄（`src/components/Header.tsx`）
- 手機版目前把切換民宿選擇器 `hidden sm:block` 完全藏起，導致無法切民宿。改為：手機時把 `AccommodationSelector` 收進 header dropdown 或改為 icon-only Sheet 觸發，仍可切換。
- Logo 群組在手機縮小/隱藏「技術合作」文字（已 hidden sm:inline）；再確認 gap 與 shrink 避免溢出。
- 用 `min-w-0`、`truncate` 確保右側按鈕群不會擠爆左側。

### 2) 側邊欄（`src/components/AppSidebar.tsx`）
- 目前 `collapsible="icon"` 在手機被 shadcn 自動改成 sheet。確認：
  - 手機打開後可捲動、關閉、點連結後 `setOpenMobile(false)` 生效（已有）。
  - 子選單 (Collapsible) 展開後在手機不會被裁切；子項目 padding 縮小。

### 3) `PageHeader` / `AdminPageHeader`（`src/components/PageHeader.tsx`）
- `action` 區塊在手機用 `flex-wrap`，動作按鈕整排會撐超版。改為手機時：
  - 只顯示「主要」按鈕（新增訂單），其他按鈕收進「⋯ 更多」`DropdownMenu`。
  - 或整個 action 區在手機 `w-full` 靠右對齊，讓 icon-only 按鈕保有可觸控大小。
- 選擇：在 `Orders.tsx` 直接自訂手機動作條，PageHeader 只放主按鈕。

### 4) `Orders.tsx` 動作列
- 手機：主 CTA「新增訂單」全寬顯示，其他（匯出/匯入/保留單）收進「更多」`DropdownMenu`（icon + 文字）。
- 桌面維持原樣（4 顆並排）。

### 5) `QuickFilters.tsx`
- 手機把每張卡 `min-h-[100px]` 改小（例如 76px），字體與 icon 微縮，`grid-cols-2` 保留但更緊湊，避免快速篩選佔滿一屏。

### 6) `OrderFilters.tsx`
- 底部「清除 / 查詢」按鈕的 `px-14` 在 360px 兩顆並排會擠爆；改為手機 `flex-1 px-4`、桌面維持 `px-14`。
- 日期選擇的 Popover 內 `Calendar` 加 `max-w-[92vw]`，避免超出視窗被裁切。
- 每個 `<select>` 已 h-12/base 文字，OK；補上 `w-full min-w-0`。

### 7) `OrdersTable.tsx` 手機卡片
- 卡片內金額列在有匯款訂金/尾款時可能過寬 → 讓 label + 金額使用 `justify-between` 並 `text-right` + `tabular-nums`，防溢出。
- 「查看詳情 / 編輯訂單」按鈕縮小為 `h-11` 並 `gap-1.5`，避免在 360px 兩顆並排字被吃字。

### 8) 分頁區（`Orders.tsx` 底部）
- 手機隱藏中間數字頁碼，只留「上一頁 / 第 X/Y 頁 / 下一頁」；`每頁顯示` 下拉在手機獨立一行。

### 9) `CreateOrderDialog.tsx` / `EditOrderDialog.tsx` / `CreateHoldOrderDialog.tsx`
- 現況：`CreateOrderDialog` 手機直接用 `!w-screen !h-screen` 全屏，OK；但內部區塊多為 `grid-cols-1 sm:grid-cols-2`，需確認 padding 從 `px-6` 縮成 `px-4` 手機更寬敞、且底部 footer 兩顆按鈕在 360px 也不會擠。
- `CreateHoldOrderDialog`：手機已切 Drawer，但表單內容確認可捲動；`max-h-[85vh]` 加 `overflow-y-auto`。
- 三個 Dialog 統一：手機底部固定 CTA bar（Sticky footer），主要「儲存」按鈕 `flex-1` 全寬。

### 10) `OrderDetail.tsx` 手機頂部動作列
- 目前條件式渲染出 3–5 顆按鈕（收款、編輯、重發信、同步 TapPay、取消訂單），手機各為全寬堆疊，佔屏過長且沒有主次。改為：
  - 手機：主 CTA「線上收款」（若可用）+「編輯」全寬並排；其他（重發信、同步退款、取消訂單）收進「⋯」DropdownMenu。
  - 桌面維持原本並排。
- 內部 `grid gap-4 md:gap-6 lg:grid-cols-2` 在手機一欄，OK；巡查 Card 內表格 / description list 是否有水平溢出，若有加 `min-w-0 break-words`。

## 技術實作要點

- 用 `useIsMobile()`（已有）判斷手機。
- 收合按鈕使用現成 `DropdownMenu` component。
- 保留所有既有事件處理器，只調整佈局與可見性。
- 統一手機觸控目標 `h-11` 以上、間距不小於 `gap-2`。

## 預期成果

- 360px 起可完整操作訂單列表、進階篩選、建立/編輯/取消訂單、切換民宿。
- 主要動作按鈕都能一眼看到並點得到，次要動作收進「更多」不占版面。
- 頁面不再左右溢出，沒有被裁切的日曆或 Select。

## 不做

- 業務邏輯、資料流、Server 端變更。
- 桌面版 UI 變更（僅新增手機 breakpoint 樣式）。
- 其他 admin 頁面（客戶、房價、通路等），如需之後再開單獨工單。
