import { describe, expect, it } from "vitest";
import {
  LATE_PAYMENT_ACTION,
  LATE_PAYMENT_NOTIFICATION_TYPE,
  buildLatePaymentNote,
  hasLatePaymentNote,
  isLatePaymentOnCancelledOrder,
  recordLatePaymentException,
} from "../../supabase/functions/_shared/latePayment";

/** 極簡 supabase stub：紀錄 insert / update 呼叫，支援 deposit_charges 去重查詢 */
function makeSupabase() {
  const state = {
    charges: [] as Record<string, unknown>[],
    notifications: [] as Record<string, unknown>[],
    orderUpdates: [] as Record<string, unknown>[],
  };
  const api = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const self = {
        select: () => self,
        eq: () => self,
        maybeSingle: async () => {
          if (table === "deposit_charges" && chain.mode === "select") {
            const found = state.charges.find(
              (c) => c.action === LATE_PAYMENT_ACTION && c.rec_trade_id === chain.recTradeId,
            );
            return { data: found ? { id: found.id } : null };
          }
          return { data: chain.inserted ?? null };
        },
        insert(row: Record<string, unknown>) {
          if (table === "deposit_charges") {
            const withId = { id: `c${state.charges.length + 1}`, ...row };
            state.charges.push(withId);
            chain.inserted = { id: withId.id };
          }
          if (table === "notifications") state.notifications.push(row);
          return self;
        },
        update(row: Record<string, unknown>) {
          if (table === "orders") state.orderUpdates.push(row);
          return self;
        },
      };
      return new Proxy(self, {
        get(t, prop) {
          if (prop === "select") {
            chain.mode = "select";
            return () => proxyWithFilter(t, chain);
          }
          // deno-lint-ignore no-explicit-any
          return (t as any)[prop];
        },
      });
    },
    state,
  };
  // 攔截 .eq("rec_trade_id", x) 以支援去重查詢
  // deno-lint-ignore no-explicit-any
  function proxyWithFilter(target: any, chain: Record<string, unknown>) {
    return new Proxy(target, {
      get(t, prop) {
        if (prop === "eq") {
          return (col: string, val: unknown) => {
            if (col === "rec_trade_id") chain.recTradeId = val;
            return proxyWithFilter(t, chain);
          };
        }
        return t[prop];
      },
    });
  }
  return api;
}

const baseParams = {
  orderId: "o1",
  accommodationId: "a1",
  orderNumber: "AB12CD34",
  amount: 8800,
  recTradeId: "REC123",
  paymentMethodLabel: "ATM 虛擬帳號",
  cancelledAt: "2026-09-01T02:00:00.000Z",
  currentPaidAmount: 0,
  currentNotes: null as string | null,
};

describe("CASE 1：未取消訂單付款 → 不進 late payment path", () => {
  it("pending / confirmed 訂單不觸發", () => {
    expect(isLatePaymentOnCancelledOrder({ order_status: "pending" }, true)).toBe(false);
    expect(isLatePaymentOnCancelledOrder({ order_status: "confirmed" }, true)).toBe(false);
  });
  it("取消訂單但付款失敗也不觸發", () => {
    expect(isLatePaymentOnCancelledOrder({ order_status: "cancelled" }, false)).toBe(false);
  });
});

describe("CASE 2：已取消訂單收到付款", () => {
  it("偵測成立", () => {
    expect(isLatePaymentOnCancelledOrder({ order_status: "cancelled" }, true)).toBe(true);
  });

  it("保留金流事實、建立例外、發出高辨識通知，且不改狀態", async () => {
    const sb = makeSupabase();
    const r = await recordLatePaymentException(sb, { ...baseParams });
    expect(r.duplicate).toBe(false);

    // 金流事實
    const charge = sb.state.charges[0];
    expect(charge.action).toBe(LATE_PAYMENT_ACTION);
    expect(charge.rec_trade_id).toBe("REC123");
    expect(charge.amount).toBe(8800);
    expect(charge.needs_manual_review).toBe(true);
    expect(charge.raw_response).toBeDefined();

    // orders：僅 paid_amount / notes / updated_at，絕不含 order_status / payment_status
    const upd = sb.state.orderUpdates[0];
    expect(upd.paid_amount).toBe(8800);
    expect(Object.keys(upd).sort()).toEqual(["notes", "paid_amount", "updated_at"]);
    expect(String(upd.notes)).toContain("[LATE PAYMENT]");

    // 通知：例外語意，不是「付款成功」
    const notif = sb.state.notifications[0];
    expect(notif.type).toBe(LATE_PAYMENT_NOTIFICATION_TYPE);
    expect(String(notif.title)).toContain("逾期款項");
    expect(String(notif.description)).toContain("AB12CD34");
    expect(String(notif.description)).toContain("REC123");
    expect(String(notif.description)).not.toContain("付款成功");
  });
});

describe("CASE 3：同一 late webhook retry ×3", () => {
  it("金額不重複、例外只有 1 筆、通知只有 1 筆", async () => {
    const sb = makeSupabase();
    await recordLatePaymentException(sb, { ...baseParams });
    await recordLatePaymentException(sb, { ...baseParams });
    await recordLatePaymentException(sb, { ...baseParams });
    expect(sb.state.charges.length).toBe(1);
    expect(sb.state.notifications.length).toBe(1);
    expect(sb.state.orderUpdates.length).toBe(1);
  });

  it("notes 已有同交易紀錄時亦視為重複", () => {
    const note = buildLatePaymentNote({ stamp: "2026-09-02 04:00", amount: 8800, recTradeId: "REC123", methodLabel: "ATM" });
    expect(hasLatePaymentNote(note, "REC123")).toBe(true);
    expect(hasLatePaymentNote(note, "OTHER")).toBe(false);
    expect(hasLatePaymentNote(null, "REC123")).toBe(false);
  });
});

describe("CASE 4：庫存不得被重新占用", () => {
  it("orders 更新不含任何庫存／狀態欄位", async () => {
    const sb = makeSupabase();
    await recordLatePaymentException(sb, { ...baseParams, recTradeId: "REC999" });
    const upd = sb.state.orderUpdates[0];
    for (const forbidden of ["order_status", "payment_status", "room_quantity", "confirmed_at", "check_in_date"]) {
      expect(upd).not.toHaveProperty(forbidden);
    }
  });
});
