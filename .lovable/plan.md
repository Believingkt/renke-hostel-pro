## 目標

讓民宿端的「角色」下拉從固定三項，擴充為可自訂任意職位名稱與預設權限：

- 保留固定角色：`總部管理員` / `民宿管理員`
- 其餘改為動態列出此民宿的「權限範本」（例：現場營運、清潔組長、財務、業主…），新增/編輯/刪除都在範本頁進行
- 在成員列表的角色下拉切換到另一個職位 → 立刻覆寫該成員的模組權限為新範本內容

## 為什麼這麼設計

資料庫的 `app_role` enum 是固定的，無法讓用戶任意新增字串。已存在的 `permission_templates`（民宿可自建職位 + 預設模組權限）正好就是「自訂角色」的容器；只要把它接進角色下拉並在切換時套用即可，避免重複造輪子。

## 變更內容

### 1. DB
- `user_roles` 新增欄位 `template_id uuid NULL`（FK→`permission_templates.id`，`ON DELETE SET NULL`），用來記錄該成員目前掛在哪個範本，下拉才知道要顯示哪一個。
- 既有資料：role=`staff` 的 row 若已有 `staff_module_permissions`，不自動推斷範本（保留 NULL，顯示為「現場營運（自訂）」）。

### 2. 後端輔助 RPC（SECURITY DEFINER）
- `apply_template_to_user(user_id, accommodation_id, template_id)`：清空該 user＋館的 `staff_module_permissions`，依範本逐筆 upsert，並把 `user_roles.template_id` 寫入、`role` 強制為 `staff`。

### 3. 前端：`src/pages/Headquarters.tsx`
- 載入該民宿的 `permission_templates`。
- 角色下拉項目：
  - `總部管理員`（只在原本允許處顯示）
  - `民宿管理員`
  - 分隔線
  - 每個範本一項（label = 範本名稱；value = `tpl:<id>`）
  - 底部「＋ 管理職位範本…」連結到 `/admin/permission-templates`
- 新增 / 變更角色：
  - 選固定角色 → 走原本 update role 流程，清掉 `template_id`
  - 選 `tpl:<id>` → 呼叫 `apply_template_to_user` RPC
- 顯示用：徽章/標籤改成「民宿管理員」或對應範本名稱。

### 4. 前端：`src/pages/PermissionTemplates.tsx`
- 既有「新增 / 編輯 / 刪除範本」功能維持。
- 編輯範本後，提示「此職位之成員的權限不會自動同步，可至帳號頁重新套用」。
- 在列表卡片加一個按鈕「重新套用至此職位成員」→ 呼叫 RPC 批次套用（可選，先做提示版即可）。

### 5. 不動
- `app_role` enum、`UserRoles.tsx`（舊頁面已棄用流向 Headquarters）、總部/team 端的角色判斷邏輯。

## 預期 UI

```
角色  [民宿管理員 ▾]
  ── 系統角色 ──
   總部管理員
   民宿管理員
  ── 職位範本 ──
   現場營運
   清潔組長
   財務
   業主
  ─────────────
   ＋ 管理職位範本…
```

切換到「清潔組長」→ toast：「已套用『清潔組長』權限（5 個模組）」，模組權限即時生效。

## 風險

- 範本被刪：`template_id` 自動變 NULL，下拉顯示「現場營運（自訂）」，模組權限保留，安全。
- 既有 staff 帳號：第一次切到範本會被覆寫；UI 在切換前彈確認。
