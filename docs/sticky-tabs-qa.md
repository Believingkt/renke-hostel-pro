# 訂房頁 Sticky Tabs QA 檢查清單

涵蓋 `SectionTabsNav`（入住方案/設施/交通建議…橫向頁籤）在 BookingVilla 頁面的行為。
目標：永遠置頂、點擊平滑捲動、捲動過程不會出現微跳或閃爍。

## 自動化 E2E（桌面 Chromium）

執行：
```
python3 tests/e2e/sticky_tabs.py
```
腳本流程：
1. 開啟一個含資料的 `/booking/villa/...` URL（從 console 找一筆 accommodation id）。
2. 滾動到 100px、500px、1500px、頁尾，每一步截圖記錄 sticky 區塊 `getBoundingClientRect().top`。
3. 對每個 tab 依序點擊，量測：
   - 點擊後 800ms 的 `window.scrollY` 是否落在目標 ±2px。
   - 動畫期間連續取樣 sticky `top` 是否始終 ≤ 預期 header 高度（不會被推離視窗）。
4. 失敗時將 `/tmp/browser/sticky-tabs/*.png` 留作證據。

## 手動檢查清單

### iOS Safari（iPhone 實機 ≥ iOS 16）
- [ ] 頁面初始載入，捲動經過原本「入住方案」位置時，sticky bar 平滑接上 header，無空隙、無閃爍。
- [ ] 快速向下用力滑（fling），sticky bar 不會短暫消失或下滑後彈回。
- [ ] 點任一頁籤 → 頁面平滑捲到對應段落；過程中 sticky bar 始終貼在 header 下方。
- [ ] 點目前所在的同一頁籤，不會「彈一下」。
- [ ] 動畫過程中用手指按住畫面，動畫應立即被打斷並交還控制權。
- [ ] 旋轉螢幕（直/橫）後 sticky 仍正常。
- [ ] 開啟瀏覽器底部工具列縮放（URL bar 展開/收合）時 sticky 不破版。

### Android Chrome（≥ Chrome 120）
- [ ] 同上 6 項。
- [ ] 開啟「平滑捲動」與「減少動態效果」兩種系統設定都應正常。

### 桌面（Chrome / Firefox / Safari）
- [ ] 視窗高度從 1200px 縮到 600px，sticky 仍正常。
- [ ] 用滾輪快速滾動時 sticky 不抖動。
- [ ] 鍵盤 Tab focus 到頁籤按鈕，按 Enter 應觸發相同平滑捲動。

## 已知不修
- 使用者在動畫過程中主動滾輪/觸控 → 動畫立即中斷（設計如此）。
