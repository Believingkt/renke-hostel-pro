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

### 補件 1：絕對不動的邏輯（實際程式碼佐證）

關鍵字搜尋（`BookingPortal.tsx:407-415` 與 `546-552`，兩處同構，皆比對原文）：
```tsx
    return roomTypes
      .filter(
        (rt) =>
          rt.name.toLowerCase().includes(q) ||
          rt.accommodation_name.toLowerCase().includes(q) ||
          rt.accommodation_region_1?.toLowerCase().includes(q) ||
          rt.accommodation_region_2?.toLowerCase().includes(q)
      )
      .map((rt) => rt.id);
```

房況／地區／館別篩選（`555-572`）：
```tsx
    // Availability filter — 森山忽略散客庫存判定，永遠保留
    if (hasDateFilter) {
      result = result.filter(
        (rt) =>
          isSensanAccommodation(rt.accommodation_name) ||
          (rt.available_rooms !== null && rt.available_rooms > 0)
      );
    }

    // Region filter
    if (filters.selectedRegion !== "all") {
      result = result.filter((rt) => rt.accommodation_region_1 === filters.selectedRegion);
    }

    // Accommodation filter
    if (filters.selectedAccommodation !== "all") {
      result = result.filter((rt) => rt.accommodation_id === filters.selectedAccommodation);
    }
```

包棟判定與館別判定（`619-621`、`654`）：
```tsx
    // 「銷售方案」(如「12 人包區」) 為虛擬人數方案，不計入實際房間數
    const isVillaPlan = (r: RoomTypeResult) =>
      /包棟|包區|whole|villa/i.test(r.name) || r.capacity >= 8;
```
```tsx
      const isSensan = isSensanAccommodation(acc.name);
```

以上四處全部讀 `rt.name` / `rt.accommodation_name` / `rt.accommodation_region_1` 等**原始欄位**。本批作法：`tf()` 產生的 `display*` 只進 JSX，篩選、regex、館別判定、價格與導頁參數一律繼續讀原始物件，上面這些程式碼一行都不會被碰到。`isVillaPlan` 的 regex 若讀到英文譯名會直接失準（`包棟|包區` 不會命中 `exclusive area`），這正是必須維持讀原文的具體理由。

### 補件 2：PortalAIChatPanel.tsx 三處敏感邏輯（目前程式碼，本批不動）

同意判斷（`116-119`）：
```tsx
  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;
    // 未取得同意前，絕不送出任何資料給第三方 AI 服務
    if (!aiConsent.granted) return;
```

錄音啟動（`306-318`）：
```tsx
  const handleMicToggle = async () => {
    if (isRecording) {
      const text = await stopRecording();
      if (text) sendMessage(text);
    } else if (!aiConsent.granted) {
      return;
    } else if (!voiceConsent.granted) {
      setVoiceConsentIntent("record");
      setShowVoiceConsent(true);
    } else {
      await startRecording();
    }
  };
```

AI 請求 payload 組裝（`129-152`）：
```tsx
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${...}` },
        body: JSON.stringify({
          messages: newMessages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
          session_id: (...)(),
          context: {
            check_in_date: format(checkIn, "yyyy-MM-dd"),
            check_out_date: format(checkOut, "yyyy-MM-dd"),
            guest_count: defaultGuests,
          },
          lang,
          guide: { active: guideActive, attrs: guideAttrs },
        }),
      });
```

本批對這支只改：歡迎語、快速提問 chips、輸入框 placeholder、按鈕 aria-label、toast 文案等純顯示字串。上述三段（含 `aiConsent.granted` / `voiceConsent.granted` 兩道閘、`slice(-20)` 歷史範圍、`context` 三個欄位）維持逐字不變，postcheck 會以這三段的 diff＝0 佐證。注意 payload 已含 `lang`，語言切換本來就已傳給後端，不需新增欄位。

### 補件 3：首頁單次可翻譯欄位量級估計

以目前正式資料實測計數：民宿 15 家（name／region_1／region_2／address 約 50 筆）、房型 51 筆名稱＋33 筆有內容的描述＝84 筆、about_section 15 組標題＋描述約 30 筆、portal_featured_cards 4 張約 8 筆。**合計約 170–180 筆**，會被切成 4 批（50／50／50／約 30）送出，全部在第四批已修好的分批機制覆蓋範圍內；若只計首屏渲染卡片則約 60–80 筆。此數字僅供備查，不改架構。


## 四、檔案範圍

**修改（8 支）**
1. `src/pages/BookingPortal.tsx`
2. `src/lib/bookingI18n.ts`（只增 key）
3. `src/components/booking-portal/PortalSearchBar.tsx`
4. `src/components/booking-portal/PortalAIChatPanel.tsx`
5. `src/components/booking-portal/RoomFilterBar.tsx`
6. `src/components/booking-portal/AccommodationCard.tsx`
7. `src/components/booking-portal/AccommodationPhotoCarousel.tsx`
8. `src/components/booking-portal/ChatRoomCard.tsx`

**補件 4：`RoomTypeCard.tsx` 不列入本批修改清單。** 該檔有「剩 N 間」「人」「坪」「每晚」「立即預訂」等顯示字串，但目前首頁改用 `AccommodationCard` 聚合呈現；施工時若發現它實際仍被渲染而必須改，會**停下來先報備、等您回覆核准才動手**，不會先改後報。

**新增**：1 支迴歸測試檔（證明搜尋、地區篩選、排序、導頁參數在切換語言後結果完全相同）。

**不動**：SearchRoomCard、BookingFooter、SavingsBadge、底部導覽、BookingFlow、CustomerOrders、四支信件函式、任何 Edge Function／DB／cron。

## 五、precheck／postcheck

precheck：上列每檔行數與 md5。
postcheck（沿用標準六項 ＋ 本批加項）：逐檔逐字 diff、字典只增不改、既有測試與基準逐項比對、typecheck、**EN 模式冷／熱兩種情境截圖＋程式化中文字串清單＋translate-content HTTP 狀態**、受保護檔案 diff＝0、確認 `/booking` 路由在 App.tsx 掛載且可公開訪問。完工不自行 Publish。
