# 第五批設計稿：首頁 BookingPortal.tsx 雙語（僅設計，未施工）

## 一、先回覆：目前全部已知殘留中文清單（現況更新）

已上線／已完工批次在英文模式下仍會出現中文的地方，逐項確認如下：

| # | 位置 | 內容 | 性質 | 歸屬批次 |
|---|---|---|---|---|
| 1 | BookingLanguageSwitch | 「繁中」 | 刻意保留（語言鈕本來就該顯示該語言自稱），非缺陷 | 不處理 |
| 2 | SavingsBadge.tsx | 「人客多優惠」 | 固定文字，結帳頁共用 | BookingFlow 批 |
| 3 | BookingFooter → BrandLogoBar | 「技術合作」 | **動態內容**（HQ 品牌夥伴後台欄位，非寫死字串） | 需走 translate-content，排 BookingFlow 批一併 |
| 4 | MobileBottomNav | 首頁／訊息／行程／我的帳號 | 固定文字 | 底部導覽批 |
| 5 | NativeTabBar | 首頁／找房／訂單／訊息／我的 | 固定文字 | 底部導覽批 |
| 6 | BookingSearchResults／PaymentResult／MemberOrders／MemberOrderDetail | 冷啟動時動態內容先閃中文 | 已知線上缺陷，`deferUntilTranslated` 尚未套用到這四頁 | 待安排小批次 |

新增遺漏檢查：本次重新掃描核心範圍檔案，**未發現上表以外的新殘留項目**。範圍外頁面（各民宿官網 Index.tsx、ai-booking、payment-receipt、atm-info、PaymentStatus、會員周邊子頁）依先前拍板不列入，也未主動檢查。

## 二、BookingPortal.tsx 唯讀盤點

- 檔案 1374 行，**目前完全沒有語言整合**：無 `BookingLocaleProvider`、無 `useBookingLocale`、無語言切換鈕。字典 `bookingI18n.ts`（1294 行）目前 `booking.portal.*` key 數為 **0**，本批需全新建立命名空間。
- 固定中文字串數：BookingPortal.tsx 33 處。
- 子元件固定中文：PortalSearchBar 43、PortalAIChatPanel 44、RoomFilterBar 15、AccommodationCard 12、ChatRoomCard 2、AccommodationPhotoCarousel 2、RoomTypeCard 1。SearchRoomCard 已於第二批完成、BookingFooter 已完成，皆不重做。
- 動態內容來源（首頁一次撈 14 張表）：`accommodation_info`（name／region_1／region_2／address）、`room_types`（name／description）、`accommodation_facilities`、`addon_settings`、`about_section`（section_title／section_description）、`portal_featured_cards`（card_display_name／card_editor_body）、`accommodation_packages`。

## 三、設計

1. 在 BookingPortal 外層包 `BookingLocaleProvider`，header 放 `BookingLanguageSwitch compact`，與 BookingVilla 一致。
2. 新增 `booking.portal.*` 字典（沿用既有命名慣例，不改任何既有 key）。
3. 動態內容沿用第二／四批模式：父層集中一組 `dynamicFields` 送出，`tf()` 產生 `displayAccommodations` 等衍生物件，子元件維持 dumb component。
4. 冷啟動直接採用第四批已驗證的 `deferUntilTranslated`（英文模式未譯前留空、不做骨架），中文模式零變化。
5. 首頁欄位量大（民宿卡＋房型卡），必然超過 60 筆；第四批已修好的 hook 分批送出（每批 50）可直接覆蓋。

### 絕對不動的邏輯（本批只換顯示層）

搜尋與篩選是以**原文**比對，翻譯只能作用在顯示：
- `BookingPortal.tsx:410-413、548-551` 關鍵字搜尋比對 `rt.name` / `accommodation_region_1/2` 原值
- `:566` 地區篩選 `rt.accommodation_region_1 === filters.selectedRegion`
- `:621` 包棟判定以 `r.name` regex 比對
- `:654` `isSensanAccommodation(acc.name)` 館別判定
- 價格（`room_inventory_pricing`、`classifyDayTier`）、庫存、人數、日期、`openFrontendBooking` 導頁參數

作法：`tf()` 只用於 JSX 顯示，所有篩選／判定／導頁一律讀原始物件欄位，不讀 `display*`。

## 四、檔案範圍

**修改（8 支）**
1. `src/pages/BookingPortal.tsx`
2. `src/lib/bookingI18n.ts`（只增 key）
3. `src/components/booking-portal/PortalSearchBar.tsx`
4. `src/components/booking-portal/PortalAIChatPanel.tsx`
5. `src/components/booking-portal/RoomFilterBar.tsx`
6. `src/components/booking-portal/AccommodationCard.tsx`
7. `src/components/booking-portal/AccommodationPhotoCarousel.tsx`
8. `src/components/booking-portal/ChatRoomCard.tsx`（＋ `RoomTypeCard.tsx` 單一字串，視實際渲染決定，若需動會先報備）

**新增**：1 支迴歸測試檔（證明搜尋、地區篩選、排序、導頁參數在切換語言後結果完全相同）。

**不動**：SearchRoomCard、BookingFooter、SavingsBadge、底部導覽、BookingFlow、CustomerOrders、四支信件函式、任何 Edge Function／DB／cron。

PortalAIChatPanel 剛因 Apple 同意流程改過，本批只改顯示文字，不碰同意判斷、錄音、AI 請求。

## 五、precheck／postcheck

precheck：上列每檔行數與 md5。
postcheck（沿用標準六項 ＋ 本批加項）：逐檔逐字 diff、字典只增不改、既有測試與基準逐項比對、typecheck、**EN 模式冷／熱兩種情境截圖＋程式化中文字串清單＋translate-content HTTP 狀態**、受保護檔案 diff＝0、確認 `/booking` 路由在 App.tsx 掛載且可公開訪問。完工不自行 Publish。
