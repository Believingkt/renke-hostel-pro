---
name: ORDER_CONTEXT_UPDATABLE_FIELDS 與 RPC 白名單對齊
description: Edge Function 共用的 ORDER_CONTEXT_UPDATABLE_FIELDS 未包含 update_order_with_context RPC 白名單的所有欄位，可能導致 HotelNabe 等呼叫端靜默丟棄欄位。
type: feature
---
2026-09-10 複查結論：暫不處理，記錄待決。

`supabase/functions/_shared/orderContext.ts` 內的 `ORDER_CONTEXT_UPDATABLE_FIELDS` 目前未包含 `guest_name`、`guest_phone`、`guest_email`、`refund_fee_amount`、`cancellation_fee_amount`、`cancellation_fee_percent`、`member_id` 等 RPC 已允許欄位。HotelNabe 等「整包 payload」呼叫端會因此靜默丟棄這些欄位。

未來若需來若需處理，應將本地常數擴充至與 RPC 白名單完全一致，或改為反向以 RPC 白名單為唯一來源。

此為非急迫債務，待後續評估。
