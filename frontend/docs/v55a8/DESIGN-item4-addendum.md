# 第四項（order_rooms 修復 RPC）補充設計決議

## 一、房號衝突留空的提醒方式

- RPC 回傳 jsonb 內含 `conflicts: [{ order_room_id, room_type_id, reason }]`，列出被留空 `room_unit_id` 的列。
- `OrderDetail.tsx`：存檔成功後若 `conflicts.length > 0`，以一次性 toast 提示（例如「有 N 間房的房號因衝突未指派，請至房況表確認」）。不在 PMS／訂房管理清單頁加任何常駐標記或驚嘆號。
- `owltingAutoOrder.ts` 路徑：不額外通知。
- **確認：房號衝突被優雅處理不觸發 `orderRoomsAlert.ts` 告警信。** 該信僅在 RPC 本身錯誤（例外／非預期失敗、交易 rollback）時寄出。衝突留空是設計內正常行為，RPC 回傳成功，不算失敗，因此不寄信。使用者的理解正確。

## 二、舊 delete+insert 邏輯的保留方式

- **不使用 feature flag，不使用執行期 fallback。**
- 兩處呼叫端（`OrderDetail.tsx` 的 `handleSaveEdit`、`owltingAutoOrder.ts` 的 `rebuildOrderRooms`）改為「只呼叫新 RPC」。RPC 回錯就直接向上拋出／顯示錯誤，絕不改走舊邏輯。
- 舊實作以獨立、無任何呼叫點的函式保留在檔案內（例如 `legacyRebuildOrderRoomsUnused_DO_NOT_CALL`），並加註解說明：僅供緊急回滾參考，不得在執行期呼叫。程式碼中不存在任何條件分支可以走到它。
- 緊急復原方式為版本控制層級：重新部署舊 commit／revert，而非切換旗標。
- 觀察期穩定後再移除保留的舊函式，時程屆時評估。
