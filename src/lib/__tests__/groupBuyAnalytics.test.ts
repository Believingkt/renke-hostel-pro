import { describe, expect, it } from "vitest";
import {
  buildAnalyticsRows,
  filterAnalyticsRows,
  summarizeAnalytics,
  type AnalyticsOrder,
  type CommissionRecord,
} from "@/lib/groupBuyAnalytics";

const order = (o: Partial<AnalyticsOrder> & { id: string }): AnalyticsOrder => ({
  order_number: o.id,
  guest_name: "客人",
  guest_phone: "0912345678",
  check_in_date: "2026-09-01",
  check_out_date: "2026-09-02",
  final_price: 10000,
  deposit_amount: 3000,
  paid_amount: 3000,
  order_date: "2026-08-01T00:00:00Z",
  order_status: "confirmed",
  payment_status: "deposit_paid",
  refund_status: null,
  refunded_amount: 0,
  ...o,
});

const comm = (order_id: string, extra: Partial<CommissionRecord> = {}): CommissionRecord => ({
  order_id,
  revenue_base: 10000,
  commission_rate: 10,
  commission_amount: 1000,
  status: "pending",
  ...extra,
});

describe("團購銷售分析口徑", () => {
  it("分潤一律讀快照，不用活動目前比例重算", () => {
    const rows = buildAnalyticsRows([order({ id: "A" })], [comm("A", { commission_rate: 8, commission_amount: 800 })]);
    expect(rows[0].commissionRate).toBe(8);
    expect(rows[0].commissionAmount).toBe(800);
  });

  it("訂金未確認＝尚未列入，取消＝不列入（NT$0）", () => {
    const rows = buildAnalyticsRows(
      [
        order({ id: "A", paid_amount: 0, payment_status: "unpaid" }),
        order({ id: "B", order_status: "cancelled" }),
      ],
      [comm("A"), comm("B")],
    );
    expect(rows[0].state).toBe("pending");
    expect(rows[0].commissionAmount).toBe(0);
    expect(rows[1].state).toBe("cancelled");
    expect(rows[1].commissionAmount).toBe(0);
  });

  it("特例退款可由人工判定列入／不列入", () => {
    const special = order({ id: "C", refunded_amount: 2000, refund_status: "partial_refunded" });
    const inc = buildAnalyticsRows([special], [comm("C", { manual_eligibility: "include" })])[0];
    const exc = buildAnalyticsRows([special], [comm("C", { manual_eligibility: "exclude" })])[0];
    expect(inc.state).toBe("special_included");
    expect(inc.commissionAmount).toBe(1000);
    expect(exc.state).toBe("special_excluded");
    expect(exc.commissionAmount).toBe(0);
  });

  it("KPI 分潤總額＝明細列加總（同一份 filtered 資料）", () => {
    const rows = buildAnalyticsRows(
      [order({ id: "A" }), order({ id: "B" }), order({ id: "C", order_status: "cancelled" })],
      [comm("A"), comm("B", { commission_amount: 1200, commission_rate: 12 }), comm("C")],
    );
    const filtered = filterAnalyticsRows(rows, "all");
    const s = summarizeAnalytics(filtered);
    expect(s.commissionTotal).toBe(filtered.reduce((n, r) => n + r.commissionAmount, 0));
    expect(s.commissionTotal).toBe(2200);
    expect(s.validOrders).toBe(2);
    expect(s.cancelledOrders).toBe(1);
  });
});
