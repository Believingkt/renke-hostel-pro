# 第四批設計稿：BookingVilla 動態內容雙語 ＋ 冷啟動處理（僅設計，未施工）

## 先回答：底部導覽的技術風險問題

`useBookingLocale` 在**沒有 Provider 的頁面不會 crash**，會安全 fallback 顯示繁中。逐字證據 `src/contexts/BookingLocaleContext.tsx:64-74`：

```ts
/** 無 Provider 時安全回退為預設中文，不 throw */
export const useBookingLocale = (): BookingLocaleValue => {
  const ctx = useContext(BookingLocaleContext);
  if (ctx) return ctx;
  return {
    lang: DEFAULT_BOOKING_LANG,
    setLang: () => {},
    t: (key, vars) => translate(DEFAULT_BOOKING_LANG, key, vars),
    dateLocale: getBookingDateLocale(DEFAULT_BOOKING_LANG),
  };
};
```

代表：底部導覽（MobileBottomNav／NativeTabBar）可以直接改用 `t()`。在 BookingFlow.tsx 這種尚未包 Provider 的頁面，導覽列一律顯示繁中（等同現況，零行為變化）；在已包 Provider 的頁面才會跟著切英文。副作用是「同頁面語言不一致」不會發生，因為 Provider 有無是以整頁為單位。此項不在本設計稿施工範圍，僅作為後續排程的風險結論。

## 一、現況盤點（BookingVilla.tsx，1666 行）

**舊 i18n 殘留品質**：字典 `bookingI18n.ts` 已有 176 條 `booking.villa.*` key，品質可用、命名一致（`booking.villa.tabs.*`、`booking.villa.header.*`、`booking.villa.overview.*`），但 BookingVilla.tsx 本體只呼叫了 17 次 `t()`。也就是**字典遠比使用面完整，既有 key 全部沿用、不重做、不改名**，本批只補「有畫面但還沒接 key」的部分。

**尚未接上的固定文字（引號內含中文的字串數）**：
- BookingVilla.tsx：58（含約 20 條是 log／event 字串與圖示比對關鍵字，不屬 UI，不動）
- CapacityPriceLadder.tsx：37、EditSearchSheet.tsx：16、VillaLocationCompact.tsx：7、VillaAvailabilityCalendar.tsx：4、FloatingAIChat.tsx：5

**尚未接翻譯的動態內容（後台維護的中文）**：
| 來源 | 欄位 |
|---|---|
| accommodation_info | name、description、address、region_1／2、check_in_notice、og/seo 文案 |
| accommodation_packages | name、方案說明、includes、room_allocation 房型名 |
| room_types | name |
| facilities | facility_name |
| FaqSection | 問題／答案 |
| BookingInfoSection | bookingSettings 政策條文、customBookingSections |
| VillaLocationCompact | locationInfo 交通說明 |
| ReviewsSection / 標頭 | 評論摘要、host response、feature tags |
| SimilarStaysCarousel | 鄰近民宿名稱／地區 |

## 二、動態內容怎麼接

沿用第二批 `BookingSearchResults.tsx` 已驗證的模式：**父層集中翻譯、子元件維持 dumb component**。

1. 在 BookingVilla 內層元件建立單一 `dynamicFields` 陣列（table／column／id／text），一次送出，避免多次呼叫 `translate-content`。
2. 以 `tf()` 產生 `displayInfo`／`displayPackages`／`displayFacilities` 等衍生物件，只覆寫顯示欄位。
3. 子元件（Facilities／Faq／BookingInfo／Location／SimilarStays／CapacityPriceLadder）改吃已翻譯的 props；若子元件自行抓資料（FaqSection、ReviewsSection 以 accommodationId 內部查詢），則在該元件內就地加一組 `useTranslatedFields`，不上移資料抓取、不改查詢。
4. 嚴禁事項：不改任何價格、庫存、人數、方案篩選、`packageDateOverrides`、導頁參數與 `/book` query string；`accommodationName` 等傳給訂單／分享／行事曆的值一律保留原文欄位，只換畫面顯示。

## 三、冷啟動處理（方案比較，建議 B）

現況：冷快取時約 0.7 秒仍顯示中文，約 1.2 秒才換成英文，造成「中文閃一下」。

- **A 骨架佔位**：翻譯未回前顯示灰塊。違反本專案「不得用骨架、避免閃爍」的既有規範，排除。
- **B（建議）英文模式下延後顯示未譯文字**：僅在 `lang === "en"` 且該欄位尚未有譯文時，該段文字先渲染為空（保留容器高度不變的行內佔位，不做動畫），譯文到達即填入。中文模式完全不受影響，零變化。
- **C 全頁 gate**：整頁等翻譯完成才顯示。首屏延遲最久、傷 SEO 與體感，排除。

搭配：`translation_cache` 命中時多為同步命中（熱快取），B 的空白窗僅出現在首次冷啟動；對已上線頁面 SEO 不影響（爬蟲取中文預設）。

## 四、檔案範圍（完整逐檔清單）

**修改（共 17 支）：**
1. `src/pages/BookingVilla.tsx`（1666 行）
2. `src/lib/bookingI18n.ts`（只增 key，不改既有 key）
3. `src/hooks/use-translated-fields.tsx`（新增可選「未譯時延後顯示」模式，預設行為不變）
4. `src/components/booking-villa/CapacityPriceLadder.tsx`（只換顯示文字）
5. `src/components/booking-villa/EditSearchSheet.tsx`（只換顯示文字）
6. `src/components/booking-villa/VillaAvailabilityCalendar.tsx`
7. `src/components/booking-villa/VillaLocationCompact.tsx`
8. `src/components/booking-villa/VillaOverviewBar.tsx`
9. `src/components/booking-villa/SimilarStaysCarousel.tsx`
10. `src/components/booking-villa/SectionTabsNav.tsx`
11. `src/components/booking-villa/VillaPhotoCarousel.tsx`
12. `src/components/booking-villa/FloatingAIChat.tsx`
13. `src/components/FacilitiesSection.tsx`（僅加可選 `translate` prop，未傳時行為完全不變）
14. `src/components/LocationSection.tsx`（同上）
15. `src/components/ReviewsSection.tsx`（同上）
16. `src/components/FaqSection.tsx`（同上）
17. `src/components/BookingInfoSection.tsx`（同上）

**新增：** 1 支迴歸測試檔。

**共用風險隔離**：第 13–17 支被 Index.tsx（民宿官網，本輪範圍外）與 GroupBuyCampaign.tsx（團購，範圍外）共用，故採「可選 prop、未傳 = 原樣中文」設計，對這兩個頁面行為影響為零；BookingVilla 傳入已譯內容。若發現其中任何一支非改介面預設不可，會停下來先問。

**不動**：`VillaPhotoLightbox.tsx`、`PackagePhotoCarousel.tsx`（無 UI 中文字串）、BookingFlow.tsx、CustomerOrders.tsx、底部導覽（MobileBottomNav／NativeTabBar）、四支通知信件函式、任何 Edge Function、資料庫、schema、cron。

## 五、precheck／postcheck

precheck：上列每一檔的行數與 md5。
postcheck：逐檔逐字 diff、字典只增不改、新增迴歸測試證明 `/book` 導頁參數與計價輸入不變、既有測試全綠＋typecheck、**EN 模式實際截圖＋程式化擷取的完整中文字串清單＋`translate-content` HTTP 狀態＋冷／熱快取兩種情境**、受保護檔案 diff＝0。完工不自行 Publish。
