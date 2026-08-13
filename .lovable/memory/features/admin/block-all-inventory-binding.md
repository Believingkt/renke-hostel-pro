---
name: 全區／全棟綁定 (blocks_all_inventory)
description: 房型關聯設定的第三種綁定方式：全區主控房型與指定範圍房型雙向整天鎖定，主控之間不互鎖。
type: feature
---

## 欄位
- `room_types.blocks_all_inventory` (bool, default false)：此房型為「全區／全棟」主控。
- `room_types.blocks_all_target_ids` (uuid[], default '{}')：鎖定範圍；空陣列＝整館所有房型（不含其他主控）。

## 規則
- 主控被訂走 → 範圍內房型當天整天關閉。
- 範圍內任一房型「只要有任一訂單佔用」（不需售完）→ 主控當天整天關閉。
- 多個主控之間**不互鎖**。
- 包棟與房間皆可設為主控；此設定與既有 `is_exclusive_package` / `is_bound_to_exclusive` 邏輯獨立疊加，舊行為不變（預設 false）。
- 範例：32人全區（主控，範圍=20人區+12人區）；20人區與12人區彼此不互鎖。

## 實作位置（兩處必須同步）
- RPC `get_adjusted_room_inventory_batch`：在 whole-building 檢查後、既有互斥分支前判定。
- `supabase/functions/_shared/availability.ts`（all-availability / accommodation-api）。
- 設定 UI：`src/components/RoomTypeForm.tsx` 底部「全區／全棟綁定」區塊。
