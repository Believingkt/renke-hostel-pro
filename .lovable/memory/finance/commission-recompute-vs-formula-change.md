---
name: 獎金「自動重算」與「改公式」的界線
description: 訂單金額合法變動後既有獎金公式自動得到新結果 = 允許；修改獎金公式或 /team 邏輯 = 禁止。
type: constraint
---
- 允許：訂單金額（final_price / 加購 / 折扣）經合法流程變動後，既有 trigger 與既有公式
  （sync_team_commission_price_from_order、create_commission_record、
  update_commission_status_on_order_change、calc_team_commission_price、
  commissionBaseFromOrder 的 LEGACY / V2 / V3）自動算出新結果。這是資料變動的自然後果，不是改公式。
- 禁止：改動任何獎金／分潤公式、版本切點、抽成排除規則，或 /team 的頁面與邏輯。
- 因此金額類 migration 只需「不觸碰」這些物件（可做存在性 precheck），
  不得為了「凍結獎金」而阻擋 AFTER trigger 重算。
- 若某次金額變動不應影響獎金，必須以既有排除機制（館別抽成排除設定／人工覆蓋）處理，不得改公式。
