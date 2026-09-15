/**
 * 訂單歷程（OrderTimelineCard）真實資料驗證
 *
 * fixture 由正式資料庫匯出（/tmp/b5/order-timeline.json，含真實訂單資料，
 * 刻意不放進 repo）。fixture 不存在時整個 describe 會 skip。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import fs from "node:fs";

const FIXTURE_PATH = "/tmp/b5/order-timeline.json";
const hasFixture = fs.existsSync(FIXTURE_PATH);
const fx: any = hasFixture ? JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) : null;

/* ---- 假 supabase client：依 table + filter 回傳 fixture ---- */
const invokeCalls: { functionName: string; body: any }[] = [];

function makeQuery(table: string) {
  const filters: Record<string, any> = {};
  const q: any = {
    select: () => q,
    order: () => q,
    limit: () => q,
    eq: (k: string, v: any) => { filters[k] = v; return q; },
    in: (k: string, v: any[]) => { filters[`in_${k}`] = v; return q; },
    then: (res: any) => Promise.resolve({ data: rows(table, filters), error: null }).then(res),
  };
  return q;
}

function rows(table: string, f: Record<string, any>) {
  if (table === "payment_status_history") return fx.payment_status_history.filter((r: any) => r.order_id === f.order_id);
  if (table === "booking_email_log") return fx.booking_email_log.filter((r: any) => r.order_id === f.order_id);
  if (table === "deposit_charges") return fx.deposit_charges.filter((r: any) => r.order_id === f.order_id);
  if (table === "group_buy_payment_events") return fx.group_buy_payment_events.filter((r: any) => r.order_id === f.order_id);
  if (table === "order_change_log") return fx.order_change_log.filter((r: any) => r.order_id === f.order_id);
  if (table === "profiles") return fx.profiles.filter((r: any) => (f.in_id || []).includes(r.id));
  if (table === "audit_logs") {
    if (f.entity_type === "order_deposit") return fx.audit_deposit.filter((r: any) => r.entity_id === f.entity_id);
    return fx.audit_order.filter((r: any) => r.entity_id === f.entity_id);
  }
  return [];
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => makeQuery(t),
    functions: {
      invoke: async (functionName: string, opts: any) => {
        invokeCalls.push({ functionName, body: opts?.body });
        return { data: { success: true }, error: null };
      },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: OrderTimelineCard } = await import("@/components/orders/OrderTimelineCard");

const ORDERS: Record<string, any> = hasFixture
  ? Object.fromEntries(fx.orders.map((o: any) => [o.order_number, o]))
  : {};

async function renderOrder(orderNumber: string, override: any = {}) {
  const o = ORDERS[orderNumber];
  render(
    <OrderTimelineCard
      orderId={o.id}
      orderNumber={o.order_number}
      canManage
      orderSource={o.order_source}
      paymentMethod={o.payment_method}
      {...override}
    />,
  );
  // 卡片預設收合：先展開再驗證內容
  const header = screen.getByRole("button", { expanded: false });
  fireEvent.click(header);
  await waitFor(() => expect(screen.queryByText("載入中…")).toBeNull());
}

function chipCount(label: string) {
  const btn = screen.getAllByRole("button").find((b) => (b.textContent || "").startsWith(label + " "));
  return Number((btn?.textContent || "").split(" ").pop());
}

function resendButtonLabels() {
  return screen
    .getAllByRole("button")
    .map((b) => (b.textContent || "").trim())
    .filter((t) => t.startsWith("重送") || t.startsWith("補寄"));
}

(hasFixture ? describe : describe.skip)("OrderTimelineCard — 真實訂單資料", () => {
  beforeEach(() => { invokeCalls.length = 0; });

  for (const num of ["YC6U86W2", "NJ3U85G6", "CE2V95Y5"]) {
    it(`${num}：渲染筆數與各篩選計數`, async () => {
      await renderOrder(num);
      const rendered = screen.getAllByTestId("timeline-item").length;
      const byKind = (k: string) =>
        screen.getAllByTestId("timeline-item").filter((el) => el.getAttribute("data-kind") === k).length;
      const out = {
        order: num,
        chips: {
          全部: chipCount("全部"), 變更: chipCount("變更"), 付款: chipCount("付款"),
          押金: chipCount("押金"), 通知信: chipCount("通知信"),
        },
        renderedRows: rendered,
        renderedByKind: { change: byKind("change"), payment: byKind("payment"), deposit: byKind("deposit"), email: byKind("email") },
        firstRows: screen.getAllByTestId("timeline-item").slice(0, 6).map((el) => el.textContent?.replace(/\s+/g, " ").trim()),
      };
      // eslint-disable-next-line no-console
      console.log("TIMELINE_OUTPUT " + JSON.stringify(out, null, 2));
      expect(out.chips.全部).toBe(
        out.chips.變更 + out.chips.付款 + out.chips.押金 + out.chips.通知信,
      );
    });
  }

  it("YC6U86W2：全部筆數（程式計算）", async () => {
    await renderOrder("YC6U86W2");
    const total = chipCount("全部");
    // eslint-disable-next-line no-console
    console.log("YC6U86W2_TOTAL " + total);
    expect(total).toBe(17);
  });

  it("篩選：點『押金』只留押金項目", async () => {
    await renderOrder("YC6U86W2");
    fireEvent.click(screen.getAllByRole("button").find((b) => b.textContent?.startsWith("押金 "))!);
    const kinds = screen.getAllByTestId("timeline-item").map((el) => el.getAttribute("data-kind"));
    // eslint-disable-next-line no-console
    console.log("FILTER_DEPOSIT " + JSON.stringify(kinds));
    expect(new Set(kinds)).toEqual(new Set(["deposit"]));
  });

  it("重送按鈕四情境快照", async () => {
    const snap: Record<string, string[]> = {};
    await renderOrder("YC6U86W2");
    snap["一般訂單 canManage=true"] = resendButtonLabels();
    document.body.innerHTML = "";
    await renderOrder("YC6U86W2", { canManage: false });
    snap["一般訂單 canManage=false"] = resendButtonLabels();
    document.body.innerHTML = "";
    await renderOrder("CE2V95Y5", { paymentMethod: "credit_card_3ds" });
    snap["團購・信用卡"] = resendButtonLabels();
    document.body.innerHTML = "";
    await renderOrder("CE2V95Y5"); // fixture 內 payment_method = atm
    snap["團購・匯款(atm)"] = resendButtonLabels();
    // eslint-disable-next-line no-console
    console.log("RESEND_SNAPSHOT " + JSON.stringify(snap, null, 2));
    expect(snap["一般訂單 canManage=true"]).toEqual(["重送訂房確認", "重送訂金通知", "重送尾款通知"]);
    expect(snap["一般訂單 canManage=false"]).toEqual([]);
    expect(snap["團購・信用卡"]).toEqual(["補寄旅客通知信：全額付款完成", "補寄民宿通知信"]);
    expect(snap["團購・匯款(atm)"]).toEqual([
      "補寄旅客通知信：訂房成立・待匯款", "補寄旅客通知信：訂金已收到", "補寄民宿通知信",
    ]);
  });

  it("三顆重送按鈕實際送出的 functionName 與 body", async () => {
    await renderOrder("YC6U86W2");
    for (const label of ["重送訂房確認", "重送訂金通知", "重送尾款通知"]) {
      fireEvent.click(screen.getAllByRole("button").find((b) => b.textContent?.trim() === label)!);
      const confirm = await screen.findByText("確認寄送");
      fireEvent.click(confirm);
      await waitFor(() => expect(invokeCalls.length).toBeGreaterThan(0));
      await waitFor(() => expect(screen.queryByText("確認寄送")).toBeNull());
    }
    // eslint-disable-next-line no-console
    console.log("INVOKE_CALLS " + JSON.stringify(invokeCalls, null, 2));
    expect(invokeCalls.map((c) => c.functionName)).toEqual([
      "admin-resend-booking-email", "admin-resend-booking-email", "admin-resend-booking-email",
    ]);
    expect(invokeCalls.map((c) => c.body.emailType)).toEqual([
      "booking_confirmation", "deposit_received", "final_payment_received",
    ]);
    expect(new Set(invokeCalls.map((c) => c.body.orderId))).toEqual(new Set([ORDERS["YC6U86W2"].id]));
  });

  it("團購補寄按鈕送出的 functionName 與 body", async () => {
    await renderOrder("CE2V95Y5");
    for (const label of ["補寄旅客通知信：訂房成立・待匯款", "補寄旅客通知信：訂金已收到", "補寄民宿通知信"]) {
      fireEvent.click(screen.getAllByRole("button").find((b) => b.textContent?.trim() === label)!);
      fireEvent.click(await screen.findByText("確認寄送"));
      await waitFor(() => expect(screen.queryByText("確認寄送")).toBeNull());
    }
    // eslint-disable-next-line no-console
    console.log("INVOKE_CALLS_GB " + JSON.stringify(invokeCalls, null, 2));
    expect(invokeCalls.map((c) => c.functionName)).toEqual([
      "group-buy-resend-notification", "group-buy-resend-notification", "group-buy-resend-notification",
    ]);
    expect(invokeCalls.map((c) => [c.body.targets[0], c.body.guestTemplate])).toEqual([
      ["guest", "booking_pending"], ["guest", "deposit_received"], ["venue", "auto"],
    ]);
  });
});
