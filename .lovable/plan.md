## 目標
比照截圖的 Trip.com 訂房頁，調整民宿前台訂房頁 (`/booking/villa/:id`) 的視覺與資訊結構。

## 截圖對應變更

### A. 頂部圖片 + 民宿資訊卡（截圖 1）
- 圖片輪播：在右上角加上「目前 / 總數」徽章（例：1/44），左上加返回鍵、右上加收藏/分享。
- 民宿名稱旁的評分標籤改成「10/10 超棒 · X 則評論」藍色文字＋小引言「"富含巧思…"」。
- 加上「特色 icon 兩欄列」：完善服務、家庭房、免費 Wi-Fi、陽台、山景、免費停車（從 facilities 取前 6 個對應 icon）。
- 加上「聯繫住宿」橫條：對話框圖示、文字＋「聯絡人」按鈕。

### B. 房型卡片重新設計（截圖 2、3、4）
- 上方加「選擇您的房間」標題＋日期/人數選擇 chip（既有資料）。
- 折扣橫條：「最高 TWD X,XXX 折扣  精選民宿優惠  全部領取」。
- 卡片：左 2/3 主圖 + 右 1/3 第二張縮圖，右下角顯示「📷 11」總相片數。
- 卡片下方：房型名 ＞、icon row（床數、坪數、景觀、禁菸、Wi-Fi）。
- 方案明細：藍色標題「能免費取消的最低價」＋免費取消日期、即時確認、可入住人數、查看詳情。
- 價格：右下藍色大字 TWD，原價刪除線，會員優惠 -% 粉色徽章。
- 「預訂」藍色大按鈕＋房間數量 select、「只剩 X 間！」紅字。
- 多方案折疊「隱藏 ∧ / 顯示更多房價 (N) ∨」。

### C. 位置區塊（截圖 5）
- 評分「10/10 位置絕佳」標題。
- Google 地圖嵌入 (既有 LocationSection 可重用，外觀加圓角＋陰影)。
- 地址列＋複製按鈕。
- Tab chips：交通、熱門地標、餐點、購物，下方顯示對應距離列表。

### D. 常見問題 / 關於 / 你可能也喜歡（截圖 6、7）
- 「您可能想知道」FAQ 改成可水平滑動的卡片，每張顯示問答 + 飯店管理人員 avatar。
- 「關於此飯店」：開幕／翻新年份 chip + 多段描述 + 顯示完整說明展開。
- 「您可能也喜歡」：水平滑動推薦卡（其他民宿縮圖 + 評分 + 價格）。

### E. 手機 sticky bottom bar
- 維持既有：左側總價＋原價刪除線＋折扣%，右側「選擇房型」藍色大按鈕（點擊滾動到房型區）。
- 改成 Trip.com 藍 `#287DFA`，桌機不顯示。

## 技術細節
- 主檔：`src/pages/BookingVilla.tsx`。
- 新增 / 改寫子元件：
  - `src/components/booking-portal/villa/VillaInfoCard.tsx`（B 區）
  - `src/components/booking-portal/villa/VillaFeatureIcons.tsx`
  - `src/components/booking-portal/villa/VillaContactHostRow.tsx`
  - `src/components/booking-portal/villa/VillaRoomPlanCard.tsx`（重點）
  - `src/components/booking-portal/villa/SimilarStaysCarousel.tsx`
- 既有元件繼續使用：`VillaPhotoCarousel`、`LocationSection`、`FaqSection`、`ReviewsSection`、`CapacityPriceLadder`。
- 顏色：採用截圖的藍 `hsl(217, 96%, 57%)` 作為 CTA / 數字主色，原本的橘色保留為次要強調。
- 不變更後端 schema、價格計算邏輯、3DS 驗證。
- RWD：手機優先 (390px)，桌機 ≥768px 維持兩欄（資訊卡左、價格卡右）。

## 實作順序
1. A 區頂部資訊卡 + icon row + 聯絡住宿。
2. B 區房型卡片（最重要、最大改動）。
3. C 區 Location tabs。
4. D 區 FAQ / About / Similar。
5. E sticky bar 配色微調。

## 不在這次範圍
- 不改後台 / 不改價格邏輯。
- 不改 `VillaPhotoCarousel` 的滑動互動（先前已調整完成）。
- 不重做 `CapacityPriceLadder`（內部仍是既有方案邏輯，只在外殼套上新樣式）。
