# 剩餘三項完整內容（設計階段，尚未施工）

## 一、B 型兩支呼叫端的抽取

### 1-1 `supabase/functions/_shared/patchBuilders.ts`（新增，純函式、不碰 DB/時間）

```ts
/* ---------- tappayWebhookProcessor ---------- */
export function buildWebhookRefundSuccessPatch(i: {
  refundedTotal: number; newPaid: number; notes: string;
}): OrderPatch {
  return {
    refunded_amount: i.refundedTotal,
    paid_amount: i.newPaid,
    payment_status: "refunded",
    notes: i.notes,
  };
}

export function buildWebhookRefundFailurePatch(i: { notes: string }): OrderPatch {
  return { notes: i.notes };
}

export function buildWebhookChargeSuccessPatch(i: {
  newPaid: number; newStatus: string; roomChargeActive: boolean;
  roomChargeAtIso: string; recTradeId: string; notes: string;
}): OrderPatch {
  const p: OrderPatch = { paid_amount: i.newPaid, payment_status: i.newStatus };
  if (i.roomChargeActive) {
    p.room_charge_status = "charged";
    p.room_charge_at = i.roomChargeAtIso;
    p.room_charge_rec_trade_id = i.recTradeId;
    p.room_charge_error = null;
  }
  p.notes = i.notes;
  return p;
}

export function buildWebhookChargeFailurePatch(i: {
  paymentStatus: string | null; roomChargeActive: boolean; errMsg: string; notes: string;
}): OrderPatch {
  const p: OrderPatch = { payment_status: i.paymentStatus };
  if (i.roomChargeActive) {
    p.room_charge_status = "failed";
    p.room_charge_error = i.errMsg;
  }
  p.notes = i.notes;
  return p;
}

/* ---------- cancel-order-with-refund ---------- */
export function buildCancelRefundFailurePatch(i: { recTradeId: string }): OrderPatch {
  return { refund_status: "failed", refund_rec_trade_id: i.recTradeId };
}

export function buildCancelOrderPatch(i: {
  nowIso: string; notes: string; refundAction: string; refundSucceeded: boolean;
  paidAmount: number; refundAmount: number; recTradeId: string | null;
}): OrderPatch {
  const patch: OrderPatch = {
    order_status: "cancelled",
    cancelled_at: i.nowIso,
    notes: i.notes,
  };
  if (i.refundAction === "auto_refund" && i.refundSucceeded) {
    const newPaid = Math.max(0, i.paidAmount - i.refundAmount);
    patch.paid_amount = newPaid;
    patch.payment_status = newPaid === 0 ? "refunded" : "partial_refunded";
    patch.refunded_amount = i.refundAmount;
    patch.refund_rec_trade_id = i.recTradeId;
    patch.refunded_at = i.nowIso;
    patch.refund_status = newPaid === 0 ? "refunded" : "partial_refunded";
  }
  if (i.refundAction === "mark_manual_refund" && i.refundAmount > 0) {
    patch.refund_status = "pending_manual";
  }
  return patch;
}
```

值與判斷式逐字沿用現行程式；`noOp`、推播、稽核寫入、錯誤處理都留在原檔案，不進 builder。

### 1-2 `tappayWebhookProcessor.ts` diff（第 231～291 行區塊）

```diff
-  const orderPatch: Json = {};
+  let orderPatch: Json = {};
   let noOp = false;

   if (eventType === "refund") {
     if (ok) {
       const refunded = Math.abs(num(payload.refunded_amount) ?? amount ?? 0);
       const { newPaid, newRefundedTotal, delta } = computeRefundAmounts({...});
       if (isStaleRefund(Number(order.refunded_amount || 0), delta)) {
         noOp = true;
       } else {
-        orderPatch.refunded_amount = newRefundedTotal;
-        orderPatch.paid_amount = newPaid;
-        orderPatch.payment_status = "refunded";
-        orderPatch.notes = appendNote(`TapPay 退款成功 NT$${refunded.toLocaleString()}（交易 ${recTradeId}）`);
+        orderPatch = buildWebhookRefundSuccessPatch({
+          refundedTotal: newRefundedTotal,
+          newPaid,
+          notes: appendNote(`TapPay 退款成功 NT$${refunded.toLocaleString()}（交易 ${recTradeId}）`),
+        });
       }
     } else {
-      orderPatch.notes = appendNote(`TapPay 退款失敗（${errMsg}），需人工處理（交易 ${recTradeId}）`);
+      orderPatch = buildWebhookRefundFailurePatch({
+        notes: appendNote(`TapPay 退款失敗（${errMsg}），需人工處理（交易 ${recTradeId}）`),
+      });
     }
   } else {
     if (ok) {
       ...
       if (isNoOpCharge({...})) { noOp = true; } else {
-        orderPatch.paid_amount = newPaid;
-        orderPatch.payment_status = newStatus;
-        if (order.room_charge_status && order.room_charge_status !== "cancelled") {
-          orderPatch.room_charge_status = "charged";
-          orderPatch.room_charge_at = new Date().toISOString();
-          orderPatch.room_charge_rec_trade_id = recTradeId;
-          orderPatch.room_charge_error = null;
-        }
-        orderPatch.notes = appendNote(`TapPay 扣款成功 NT$${charged.toLocaleString()}（交易 ${recTradeId}）`);
+        orderPatch = buildWebhookChargeSuccessPatch({
+          newPaid,
+          newStatus,
+          roomChargeActive: !!order.room_charge_status && order.room_charge_status !== "cancelled",
+          roomChargeAtIso: new Date().toISOString(),
+          recTradeId,
+          notes: appendNote(`TapPay 扣款成功 NT$${charged.toLocaleString()}（交易 ${recTradeId}）`),
+        });
       }
     } else {
-      orderPatch.payment_status = Number(order.paid_amount || 0) > 0 ? order.payment_status : "unpaid";
-      if (order.room_charge_status && order.room_charge_status !== "cancelled") {
-        orderPatch.room_charge_status = "failed";
-        orderPatch.room_charge_error = errMsg;
-      }
-      orderPatch.notes = appendNote(`TapPay 扣款失敗（${errMsg}），已回滾付款狀態，需人工處理`);
+      orderPatch = buildWebhookChargeFailurePatch({
+        paymentStatus: Number(order.paid_amount || 0) > 0 ? (order.payment_status ?? null) : "unpaid",
+        roomChargeActive: !!order.room_charge_status && order.room_charge_status !== "cancelled",
+        errMsg,
+        notes: appendNote(`TapPay 扣款失敗（${errMsg}），已回滾付款狀態，需人工處理`),
+      });
     }
   }
```

RPC 呼叫、`Object.keys(orderPatch).length > 0` 判斷、推播段落一字不動。

### 1-3 `cancel-order-with-refund/index.ts` diff（兩處）

```diff
-        await supabase.rpc("update_order_with_context", {
-          p_order_id: order.id,
-          p_patch: { refund_status: "failed", refund_rec_trade_id: recTradeIdUsed },
+        await supabase.rpc("update_order_with_context", {
+          p_order_id: order.id,
+          p_patch: buildCancelRefundFailurePatch({ recTradeId: recTradeIdUsed }),
           p_source: "admin_cancel_refund",
```

```diff
-    const patch: Record<string, any> = {
-      order_status: "cancelled",
-      cancelled_at: nowIso,
-      notes: newNotes,
-    };
-    if (body.refundAction === "auto_refund" && refundSucceeded) {
-      const newPaid = Math.max(0, paidAmount - refundAmount);
-      patch.paid_amount = newPaid;
-      patch.payment_status = newPaid === 0 ? "refunded" : "partial_refunded";
-      patch.refunded_amount = refundAmount;
-      patch.refund_rec_trade_id = recTradeIdUsed;
-      patch.refunded_at = nowIso;
-      patch.refund_status = newPaid === 0 ? "refunded" : "partial_refunded";
-    }
-    if (body.refundAction === "mark_manual_refund" && refundAmount > 0) {
-      patch.refund_status = "pending_manual";
-    }
+    const patch = buildCancelOrderPatch({
+      nowIso,
+      notes: newNotes,
+      refundAction: body.refundAction,
+      refundSucceeded,
+      paidAmount,
+      refundAmount,
+      recTradeId: recTradeIdUsed ?? null,
+    });
```

### 1-4 抽取前後欄位集合比對（實際輸出）

同一支腳本各跑一次「舊 inline 邏輯」與「新 builder」，逐 case 比對 key 集合與值：

```
PASS webhook 退款成功        old/new = notes,paid_amount,payment_status,refunded_amount
PASS webhook 退款失敗        old/new = notes
PASS webhook 扣款成功(有入住扣款) old/new = notes,paid_amount,payment_status,room_charge_at,
                                room_charge_error,room_charge_rec_trade_id,room_charge_status
PASS webhook 扣款成功(無入住扣款) old/new = notes,paid_amount,payment_status
PASS webhook 扣款失敗(有入住扣款) old/new = notes,payment_status,room_charge_error,room_charge_status
PASS webhook 扣款失敗(已有已付)   old/new = notes,payment_status
PASS cancel 自動退刷失敗      old/new = refund_rec_trade_id,refund_status
PASS cancel 自動退刷全額      old/new = cancelled_at,notes,order_status,paid_amount,payment_status,
                                refund_rec_trade_id,refund_status,refunded_amount,refunded_at
PASS cancel 自動退刷部分      old/new = 同上
PASS cancel 手動退款          old/new = cancelled_at,notes,order_status,refund_status
PASS cancel 不退款            old/new = cancelled_at,notes,order_status
ALL PASS (11/11)  值完全相同: true  白名單外欄位: 無
```

### 1-5 正式資料 BEGIN…ROLLBACK（訂單 CE2V95Y5，已完整回滾）

```
before:               order_status=confirmed payment_status=deposit_paid paid_amount=6983
                      refunded_amount=0 refund_status=none room_charge_status=null
after_webhook_charge: paid_amount=12000 payment_status=paid room_charge_status=charged
                      room_charge_at=2026-09-10T07:00:00+00:00
                      room_charge_rec_trade_id=TEST_REC_1 room_charge_error=null
after_cancel_refund:  order_status=cancelled cancelled_at=2026-09-10T07:00:00+00:00
                      payment_status=refunded paid_amount=0 refunded_amount=12000
                      refund_status=refunded refunded_at=2026-09-10T07:00:00+00:00
after_refund_fail:    refund_status=failed refund_rec_trade_id=TEST_REC_1
change_log:  tappay_webhook / TapPay / system            changed_at(台北)=2026-09-10 15:02:48
             admin_cancel_refund / 取消退款（操作者 test@lakeze.com）×2
ROLLBACK 後複查：order_status=confirmed payment_status=deposit_paid paid_amount=6983
                 refund_status=none cancelled_at=null，order_change_log 筆數=0（完全無殘留）
```
