---
name: 訂單成交日（order_date）口徑與閘門
description: order_date 為全站成交日基準、created_at 不可動、保留單轉正、已結算期閘門等建單／補填規則。
type: feature
---

# 成交日（order_date）重要參考資訊

1. **`created_at` 絕對不可改**：涉及重複下單防護、付款倒數（含 ATM 逾期）、逾期清理、稽核。任何補填需求都不得改寫它。
2. **`order_date` 就是全站「成交日」基準**：獎金快照、業主月結、業績統計、營運分析都看它。不新增 `deal_date`，避免雙軌口徑；改為在受控條件下開放編輯（角色限制、回填天數限制、寫 audit log、統一寫入 `12:00+08:00` 避免時區位移）。
3. **保留單轉正**：建單時 `created_at` 與 `order_date` 同時寫入；轉正時預設應把 `order_date` 更新為「轉正日」，並允許手動覆寫（否則 7 月保留、8 月成交會被記早）。
4. **已結算期閘門**：若該 `order_date` 所屬期別的獎金／月結快照已結算（發放已截止，通常每月 10 日後），不得直接改寫成交日；需走重算流程並將快照歸入次月發放期，UI 要明示「實際發放期」。

## 已實作規則（2026-08-20）

- 訂單詳情「訂購日期」旁的「修改」入口**僅 super_admin** 可見（`DealDateEditDialog`）。
- 只改日期、保留原本時分秒（台北時區換日）；不得填未來日期。
- 同期別（同月）內不限天數；跨期別需二次確認才寫入。
- **已結算期閘門**：原期別或新期別任一已有 `commission_payout_marks.payout_status='paid'` 的成交組快照 → 直接擋下，不寫入。
- 成交日變更寫 `audit_logs`（`type: order_deal_date_change`），`orderAuditDiff` 標籤為「訂購日期（成交日）」。
- 保留單轉正（hold → confirmed）自動把 `order_date` 設為 `confirmed_at`（OrderDetail 與 OrderStatusDialog 兩條路徑皆有）。
- LINE 每日業績通報（`send-daily-performance`）本來就以 `order_date` 為期間基準，另加三段標記：歷史訂單異動（去重）、今日補登（成交日 X/X）、保留轉正。
