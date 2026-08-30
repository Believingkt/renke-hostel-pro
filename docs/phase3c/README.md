# Phase 3C-1｜order_rooms Narrow RPC + Future RLS Draft（NO APPLY）

本目錄僅為 **未套用草稿**。不得複製進 `supabase/migrations/`。
production RPC / RLS / frontend / Edge / data 修改 = 0。

## 檔案
- `01_clear_order_room_pricing_template.sql` — narrow SECURITY DEFINER RPC 草稿
- `02_order_rooms_rls_future.sql` — 未來 STEP 4 的 order_rooms Staff WRITE RLS 草稿
- `03_verification_queries.sql` — policy 對帳、authorization matrix、data behavior、anomaly

## 正式架構決策
| 動作 | Owner |
|---|---|
| order_rooms 一般 structural CRUD | `orders` module-aware RLS |
| 刪除 pricing template 前清除 `template_id/template_name` | `room_price` → narrow RPC |

`pricing` permission **不**授權 RPC。禁止 `orders OR room_price` 之類的 full-table simple OR。

## Deployment Sequence（不得跳步）
1. STEP 1 建立 production RPC，**保留**現有 broad Staff RLS
2. STEP 2 frontend：PricingTemplateManager 改走 RPC + room_price permission UI + delete flow error handling → Preview/tests → Publish
3. STEP 3 production frontend smoke
4. STEP 4 才收緊 order_rooms Staff INSERT/UPDATE/DELETE RLS

先做 STEP 4 會讓現行 direct UPDATE 立即失效。

## Production 現況（唯讀查得）
order_rooms policies：
- SELECT `Order rooms visible to staff and finance`（本 Phase 不動）
- UPDATE / DELETE 各有 Admin policy（凍結，不得移除／縮減／放寬）
- **INSERT 只有一條 broad Staff policy，沒有 Admin INSERT policy** → STEP 4 DROP 後必須補 `Admins can insert order rooms`，草稿已含（GAP 記錄：`ORDER_ROOMS_MISSING_ADMIN_INSERT_POLICY`）

Triggers（RPC 使用一般 UPDATE，語意與現行 frontend direct UPDATE 一致；不 disable、不 bypass）：
- `trg_hotelnabe_enqueue_from_order_rooms`（AFTER INSERT/UPDATE/DELETE，全列）
- `trg_order_rooms_owlting_enqueue`（AFTER INSERT/UPDATE/DELETE，全列）
- `trg_order_rooms_prevent_double_submit`（BEFORE INSERT，不觸發）
- `trg_validate_room_unit_no_conflict`（BEFORE INSERT OR UPDATE **OF room_unit_id**，清 template 不觸發）
- `validate_order_rooms_inventory_trigger`（BEFORE INSERT OR UPDATE，全列，會觸發）

## Production anomaly（唯讀，未修資料）
| 項目 | count |
|---|---|
| `template_id` 指向不存在 template | 0 |
| template 館別 ≠ order 館別 | 0 |
| `template_id IS NULL` 但 `template_name` 非 NULL | 398 |

398 筆屬歷史快照名稱殘留（RPC 清除後本來就會落入此形態），不影響 RPC 語意，不在本 Phase 處理。

## Delete flow future contract（設計，未施工）
1. `clear_order_room_pricing_template` RPC → 檢 error、取 `cleared_count`；失敗即 STOP
2. `room_inventory_pricing` 標記 `last_change_source` → 檢 error（0 rows 合法：該 template 未展開任何日價）
3. `room_inventory_pricing` DELETE by template → 檢 error / rows
4. `pricing_templates` DELETE → 檢 error / rows（0 rows = 失敗）

只有 1–4 全成功才 toast success。

**現況 BUG（記錄，未修）**：`src/components/PricingTemplateManager.tsx:762-797` 步驟 1–3 完全未檢 error，且第 2/3 步用 `.eq('template_id', …)`，但 `room_inventory_pricing` 實際欄位為 `pricing_template_id` → 這兩個 request 應為永久失敗且被靜默吞掉。記為 `PRICING_TEMPLATE_DELETE_WRONG_COLUMN`（屬 STEP 2 frontend 範圍）。

## Delete transactionality：建議 A
- A（只把 clear order_rooms 做 RPC，其餘維持 frontend 逐步）：security 收斂到位、business regression 最小、frontend 改動小；缺點是四步仍非單一 transaction，中途失敗可能留下「template 已解參照但 template 未刪」的中間態（可重試，無資料破壞）。
- B（整包 `delete_pricing_template` RPC）：atomicity 最佳，但需把 room_inventory_pricing 清理與 audit source 標記一併搬進 DB，牽動 audit log 判讀與現有 cascade 行為，regression 風險與成本高。
- 現有 cascade：`pricing_templates` 被 5 張表參照 — `pricing_template_applications`、`room_inventory_pricing`、`pricing_template_availability`、`owlting_room_type_group_members` 皆 `ON DELETE CASCADE`；`order_rooms.template_id` 為 `NO ACTION`（因此才需要先清參照）。
- 結論：**採 A**；B 留待未來若出現實際中間態問題再評估。

## Alias 修正設計（未施工）
`/admin/pricing?tab=basic` 與 `/admin/projects` 皆會 render PricingTemplateManager。未來 frontend 必須在 tab=basic 時額外遵守 `room_price` 的 canView / canEdit，不得因 `pricing=editable` 取得 template write UI（production 有 4 組 mismatch pair）。

## 追蹤中（本輪不處理）
- `ORDER_ROOMS_FALSE_SUCCESS_FOLLOWUP`（OrderDetail:1309、CreateHoldOrderDialog:428 等）
- `CHANGE_ORDER_DATES_RPC_AUTHZ_GAP`（orders Phase）
- `PRICING_TAB_MODULE_ALIAS_NOTE`
- `PRICING_TEMPLATE_DELETE_WRONG_COLUMN`
- `ORDER_ROOMS_MISSING_ADMIN_INSERT_POLICY`
