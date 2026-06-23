# 精選民宿卡片設定分頁

在 **官網內容** 頁籤底下新增一個獨立分頁「精選民宿卡片」，讓每間民宿可獨立管理 Portal 首頁卡片上顯示的所有內容，與「關於我們」、「輪播圖管理」等其他區塊解耦。

## 範圍：可設定的欄位

對應卡片由上到下：

1. **卡片輪播照片**（獨立於首頁 Hero 輪播）
   - 多張圖片上傳、排序、刪除（最多 8 張）
2. **顯示名稱**（可覆寫 `accommodation_info.name`，留空則 fallback）
3. **地點文字**（可覆寫 region_1 · region_2，留空則 fallback）
4. **管家推薦標題**（預設「管家推薦 · Editor's Pick」，可改）
5. **管家推薦內文**（獨立欄位，不再吃 `about_section.section_description`）
6. **CTA 按鈕文字**（預設「探索這間民宿」，可改）
7. **顯示開關**（是否在 Portal 顯示這張卡片）

## 技術做法

### 1. 資料層
- 新增資料表 `portal_featured_cards`：
  - `accommodation_id` (PK, FK → accommodation_info)
  - `display_name`, `location_override`, `editor_pick_title`, `editor_pick_body`, `cta_label`
  - `is_visible boolean default true`
  - `updated_at`
- 新增資料表 `portal_featured_card_photos`：
  - `id`, `accommodation_id`, `photo_url`, `display_order`
- RLS：authenticated 可讀寫、anon 可讀（Portal 公開讀取）
- GRANT 完整權限

### 2. HQ／管理後台
- 在 `WebsiteContent.tsx` 頁籤列新增「精選民宿卡片」分頁
- 新元件 `src/components/website-content/PortalFeaturedCardSection.tsx`：
  - 照片上傳器（複用既有 hero 上傳邏輯）
  - 表單欄位（標題/內文/按鈕/顯示開關）
  - 即時預覽縮圖

### 3. Portal 前端
- `BookingPortal.fetchData` 多撈 `portal_featured_cards` 與 `portal_featured_card_photos`
- `AccommodationInfo` 多帶這些欄位，並以 portal 設定優先、fallback 至既有資料：
  - 照片：若 portal 有照片則用，否則 fallback `hero_photos`
  - 名稱／地點／推薦文／按鈕：覆寫優先，否則 fallback
- `is_visible = false` 的民宿不顯示卡片

## 不在此範圍
- 桌機版「雜誌式」排版的個別覆寫（仍共用相同來源欄位）
- 多語系欄位

---

請確認上方欄位範圍與表格設計，OK 我就開工。若你只想要「管家推薦」獨立可編輯（不需要照片／按鈕／名稱覆寫），告訴我，我可以縮成單一欄位的小型版本。
