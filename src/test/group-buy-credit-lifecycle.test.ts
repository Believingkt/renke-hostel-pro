/**
 * Phase G2-C：團購信用卡「付款成功後才建單」完整生命週期測試
 *
 * 分層：
 *   [pure unit]        建單 payload / 佣金 payload / 退款狀態推導
 *   [kernel integration] completeGroupBuyCreditOrder × in-memory DB（含 claim 互斥語意）
 *   [concurrency]      前端回程 × TapPay callback 同時完成同一張 draft
 *
 * 不連線任何真實資料庫、不呼叫 TapPay。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (globalThis as any).Deno = {
    env: { get: (k: string) => (k === "TAPPAY_PARTNER_KEY" ? "test_partner_key" : undefined) },
  };
});

/* ─────────────── in-memory DB（模擬 PostgREST chain 與行鎖語意） ─────────────── */

type Row = Record<string, any>;
const db: Record<string, Row[]> = {};

function reset() {
  for (const k of Object.keys(db)) delete db[k];
  db.group_buy_payment_drafts = [];
  db.orders = [];
  db.group_buy_payment_events = [];
  db.group_buy_commissions = [];
  db.notifications = [];
  db.group_buy_campaigns = [{ id: "camp-1", title: "測試團購", deposit_percentage: 30, payment_deadline_hours: 72 }];
  db.accommodation_info = [{ id: "acc-1", name: "測試民宿" }];
}

class Q {
  private filters: Array<(r: Row) => boolean> = [];
  private mode: "select" | "update" | "insert" = "select";
  private payload: Row | null = null;
  private returning = false;

  constructor(private table: string) {}

  select(_c?: string) {
    if (this.mode !== "select") this.returning = true;
    return this;
  }
  insert(v: Row) {
    this.mode = "insert";
    this.payload = v;
    return this;
  }
  update(v: Row) {
    this.mode = "update";
    this.payload = v;
    return this;
  }
  eq(c: string, v: any) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  is(c: string, v: any) {
    this.filters.push((r) => (v === null ? r[c] == null : r[c] === v));
    return this;
  }
  in(c: string, vs: any[]) {
    this.filters.push((r) => vs.includes(r[c]));
    return this;
  }
  lt(c: string, v: any) {
    this.filters.push((r) => String(r[c] ?? "") < String(v));
    return this;
  }
  not(c: string, op: string, v: any) {
    this.filters.push((r) => (op === "is" && v === null ? r[c] != null : r[c] !== v));
    return this;
  }
  limit(_n: number) {
    return this;
  }
  private rows() {
    return (db[this.table] ??= []).filter((r) => this.filters.every((f) => f(r)));
  }
  private run() {
    const t = (db[this.table] ??= []);
    if (this.mode === "insert") {
      const row = { id: `${this.table}-${t.length + 1}`, created_at: new Date().toISOString(), ...this.payload };
      t.push(row);
      return [row];
    }
    if (this.mode === "update") {
      const hits = this.rows();
      for (const r of hits) Object.assign(r, this.payload, { updated_at: new Date().toISOString() });
      return hits;
    }
    return this.rows();
  }
  async maybeSingle() {
    const r = this.run();
    return { data: r[0] ?? null, error: null };
  }
  async single() {
    const r = this.run();
    return { data: r[0] ?? null, error: r.length ? null : { message: "no rows" } };
  }
  then(res: any, rej?: any) {
    try {
      return Promise.resolve({ data: this.run(), error: null }).then(res, rej);
    } catch (e) {
      return Promise.resolve({ data: null, error: e }).then(res, rej);
    }
  }
}

const admin: any = {
  from: (t: string) => new Q(t),
  rpc: async (_n: string, _a: any) => ({ data: null, error: null }),
};

/* ─────────────── 外部相依 mock ─────────────── */

const tappay = vi.hoisted(() => ({
  queryTapPayRecord: vi.fn(),
  refundTapPay: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/tappay.ts", () => tappay);

const emails = vi.hoisted(() => ({ sent: [] as any[] }));
vi.mock("../../supabase/functions/_shared/groupBuyEmail.ts", () => ({
  sendGroupBuyEmail: vi.fn(async (to: any, mail: any) => {
    emails.sent.push({ to, subject: mail.subject });
    return { ok: true };
  }),
  renderDepositReceived: (o: any) => ({ subject: `guest:${o.orderNumber}`, html: "" }),
  renderVenueNewOrder: (o: any) => ({ subject: `venue:${o.orderNumber}`, html: "" }),
}));

vi.mock("../../supabase/functions/_shared/notifyRecipients.ts", () => ({
  resolveOrderNotifyEmails: vi.fn(async () => ({ emails: ["venue@example.com"], source: "campaign" })),
}));

const booking = vi.hoisted(() => ({
  validateAndPriceGroupBuyBooking: vi.fn(),
  convertGroupBuyDraftToOrderAtomic: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/groupBuyBooking.ts", () => booking);

import { completeGroupBuyCreditOrder } from "../../supabase/functions/_shared/groupBuyCreditCompletion";
import { deriveRefundStatus } from "../../supabase/functions/_shared/groupBuyRefundStatus";

/* ─────────────── helpers ─────────────── */

const DRAFT_ID = "draft-1";

function seedDraft(over: Row = {}) {
  const d: Row = {
    id: DRAFT_ID,
    idempotency_key: "GBTEST",
    campaign_id: "camp-1",
    campaign_package_id: "pkg-1",
    accommodation_id: "acc-1",
    room_type_id: "rt-1",
    check_in_date: "2026-10-01",
    check_out_date: "2026-10-02",
    room_quantity: 1,
    adult_count: 2,
    child_count: 0,
    toddler_count: 0,
    infant_count: 0,
    guest_count: 2,
    guest_name: "王小明",
    guest_phone: "0912345678",
    guest_email: "guest@example.com",
    booking_payload: { package_name: "雙人房專案", nights: 1 },
    price_snapshot: { grand_total: 10000 },
    total_price: 10000,
    deposit_amount: 3000,
    amount_to_charge: 3000,
    status: "payment_processing",
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    rec_trade_id: "REC123",
    refunded_amount: 0,
    converted_order_id: null,
    guest_email_sent_at: null,
    venue_email_sent_at: null,
    updated_at: new Date().toISOString(),
    ...over,
  };
  db.group_buy_payment_drafts.push(d);
  return d;
}

const okPlan = () => ({
  ok: true,
  plan: {
    campaign: { id: "camp-1", title: "測試團購", accommodation_id: "acc-1" },
    pkg: { id: "pkg-1", display_name: "雙人房專案" },
    total: 10000,
    deposit: 3000,
    balance: 7000,
    priceSnapshot: {},
    dates: ["2026-10-01"],
    roomQuantity: 1,
    input: { checkInDate: "2026-10-01", checkOutDate: "2026-10-02", guestName: "王小明" },
  },
});

/** 模擬 convert_group_buy_payment_draft RPC 的原子語意 */
function atomicConvertMock() {
  return vi.fn(async (_a: any, plan: any, opts: any) => {
    const d = db.group_buy_payment_drafts.find((x) => x.id === opts.draftId)!;
    if (d.converted_order_id) {
      const ex = db.orders.find((o) => o.id === d.converted_order_id)!;
      return { ok: true, alreadyConverted: true, order: ex };
    }
    const order = {
      id: `order-${db.orders.length + 1}`,
      order_number: `A1B2C3D${db.orders.length + 1}`,
      accommodation_id: plan.campaign.accommodation_id,
      guest_email: "guest@example.com",
      guest_phone: "0912345678",
      adult_count: 2,
      child_count: 0,
      toddler_count: 0,
      infant_count: 0,
      total_price: plan.total,
      paid_amount: opts.paid?.amount ?? 0,
      notes: "方案：雙人房專案 × 1 間 × 1 晚",
    };
    db.orders.push(order);
    db.group_buy_commissions.push({ order_id: order.id, campaign_id: plan.campaign.id });
    d.converted_order_id = order.id;
    d.status = "converted";
    d.converted_at = new Date().toISOString();
    return { ok: true, alreadyConverted: false, order };
  });
}

beforeEach(() => {
  reset();
  emails.sent.length = 0;
  vi.clearAllMocks();
  tappay.queryTapPayRecord.mockResolvedValue({ found: true, recordStatus: 0, amount: 3000, refundedAmount: 0 });
  tappay.refundTapPay.mockResolvedValue({ success: true });
  booking.validateAndPriceGroupBuyBooking.mockResolvedValue(okPlan());
  booking.convertGroupBuyDraftToOrderAtomic.mockImplementation(atomicConvertMock());
});

/* ══════════════════ [pure unit] ══════════════════ */

describe("[pure unit] Draft 退款對帳狀態推導（CASE 15）", () => {
  it("未退款 / 部分退款 / 全額退款", () => {
    expect(deriveRefundStatus(3000, 0)).toBe("none");
    expect(deriveRefundStatus(3000, 1000)).toBe("partial_refunded");
    expect(deriveRefundStatus(3000, 3000)).toBe("refunded");
    expect(deriveRefundStatus(3000, 5000)).toBe("refunded");
    expect(deriveRefundStatus(0, 0)).toBe("none");
  });
});

/* ══════════════════ [kernel integration] ══════════════════ */

describe("[integration] Draft 生命週期", () => {
  it("CASE 1: Draft 存在但尚未付款完成時，資料庫沒有任何 order / commission", async () => {
    seedDraft({ status: "pending", rec_trade_id: null });
    const r = await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "frontend" });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400); // 缺少交易編號
    expect(db.orders).toHaveLength(0);
    expect(db.group_buy_commissions).toHaveLength(0);
  });

  it("CASE 5: TapPay 付款失敗 → draft=failed，不建單、不寄信", async () => {
    seedDraft();
    tappay.queryTapPayRecord.mockResolvedValue({ found: true, recordStatus: 2, amount: 3000 });
    const r = await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "frontend" });
    expect(r.ok).toBe(false);
    expect(db.group_buy_payment_drafts[0].status).toBe("failed");
    expect(db.orders).toHaveLength(0);
    expect(emails.sent).toHaveLength(0);
  });

  it("CASE 6: 實收金額與 draft 應收不符 → manual_review + 管理員通知，絕不建單", async () => {
    seedDraft();
    tappay.queryTapPayRecord.mockResolvedValue({ found: true, recordStatus: 0, amount: 1 });
    const r = await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "frontend" });
    expect(r.manualReview).toBe(true);
    expect(db.orders).toHaveLength(0);
    expect(db.group_buy_payment_drafts[0].status).toBe("manual_review");
    expect(db.notifications).toHaveLength(1);
    expect(db.notifications[0].title).toContain("金額不符");
  });

  it("CASE 7: 付款成功 → 建立 1 張 order + 1 筆 commission + draft=converted", async () => {
    seedDraft();
    const r = await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "frontend" });
    expect(r.ok).toBe(true);
    expect(db.orders).toHaveLength(1);
    expect(db.group_buy_commissions).toHaveLength(1);
    const d = db.group_buy_payment_drafts[0];
    expect(d.status).toBe("converted");
    expect(d.converted_order_id).toBe(db.orders[0].id);
  });

  it("CASE 7: 建單金額一律沿用 draft 凍結值，即使活動即時價已變動", async () => {
    seedDraft({ total_price: 8888, deposit_amount: 2222, amount_to_charge: 2222 });
    tappay.queryTapPayRecord.mockResolvedValue({ found: true, recordStatus: 0, amount: 2222 });
    booking.validateAndPriceGroupBuyBooking.mockResolvedValue({
      ...okPlan(),
      plan: { ...okPlan().plan, total: 99999, deposit: 30000 },
    });
    await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "frontend" });
    const passedPlan = booking.convertGroupBuyDraftToOrderAtomic.mock.calls[0][1];
    expect(passedPlan.total).toBe(8888);
    expect(passedPlan.deposit).toBe(2222);
    expect(passedPlan.balance).toBe(6666);
  });

  it("CASE 8: 重複完成（PaymentResult 重整 / callback 重送）只會有一張 order", async () => {
    seedDraft();
    const a = await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "frontend" });
    const b = await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "callback" });
    const c = await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "frontend" });
    expect(a.ok && b.ok && c.ok).toBe(true);
    expect(b.alreadyConverted).toBe(true);
    expect(c.alreadyConverted).toBe(true);
    expect(db.orders).toHaveLength(1);
    expect(db.group_buy_commissions).toHaveLength(1);
  });

  it("CASE 11: 保留已過期但仍有庫存 → 照常建單並註記逾時", async () => {
    seedDraft({ expires_at: new Date(Date.now() - 60_000).toISOString() });
    const r = await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "frontend" });
    expect(r.ok).toBe(true);
    expect(db.orders).toHaveLength(1);
    const notes: string[] = booking.convertGroupBuyDraftToOrderAtomic.mock.calls[0][2].extraNoteLines;
    expect(notes.some((l) => l.includes("付款保留逾時後付款成功"))).toBe(true);
  });

  it("CASE 12: 保留過期且已無庫存 → 自動全額退款 + manual_review + 管理員通知，不建單", async () => {
    seedDraft({ expires_at: new Date(Date.now() - 60_000).toISOString() });
    booking.validateAndPriceGroupBuyBooking.mockResolvedValue({ ok: false, error: "此日期已無空房", status: 409 });
    const r = await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "frontend" });
    expect(r.refunded).toBe(true);
    expect(r.manualReview).toBe(true);
    expect(tappay.refundTapPay).toHaveBeenCalledWith("test_partner_key", "REC123", 3000);
    expect(db.orders).toHaveLength(0);
    const d = db.group_buy_payment_drafts[0];
    expect(d.status).toBe("manual_review");
    expect(d.refunded_amount).toBe(3000);
    expect(d.refund_status).toBe("refunded");
    expect(db.notifications).toHaveLength(1);
  });

  it("CASE 12b: 自動退款失敗 → 標記 refund_failed 並發出人工處理通知", async () => {
    seedDraft();
    booking.validateAndPriceGroupBuyBooking.mockResolvedValue({ ok: false, error: "此日期已無空房", status: 409 });
    tappay.refundTapPay.mockResolvedValue({ success: false, msg: "timeout" });
    const r = await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "frontend" });
    expect(r.refunded).toBe(false);
    expect(db.group_buy_payment_drafts[0].refund_status).toBe("refund_failed");
    expect(db.notifications[0].title).toContain("需人工處理");
  });

  it("CASE 10/13: 原子轉單失敗（rollback）→ 無 order、無 commission、manual_review + 管理員通知", async () => {
    seedDraft();
    booking.convertGroupBuyDraftToOrderAtomic.mockResolvedValue({
      ok: false,
      error: "訂單建立失敗：group_buy_oversold_on_convert",
      status: 500,
    });
    const r = await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "frontend" });
    expect(r.manualReview).toBe(true);
    expect(db.orders).toHaveLength(0);
    expect(db.group_buy_commissions).toHaveLength(0);
    expect(db.group_buy_payment_drafts[0].status).toBe("manual_review");
    expect(db.notifications).toHaveLength(1);
    expect(db.notifications[0].title).toBe("TapPay 已付款，但正式訂單建立失敗，需要人工處理");
    expect(db.notifications[0].description).toContain("REC123");
    expect(db.notifications[0].description).toContain("Draft ID");
    expect(emails.sent).toHaveLength(0);
  });
});

/* ══════════════════ [email exactly once] ══════════════════ */

describe("[integration] Email 一次性（CASE 14）", () => {
  it("首次轉單寄出旅客 + 民宿各一封", async () => {
    seedDraft();
    await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "frontend" });
    expect(emails.sent).toHaveLength(2);
    expect(emails.sent.map((e) => e.subject.split(":")[0]).sort()).toEqual(["guest", "venue"]);
    const d = db.group_buy_payment_drafts[0];
    expect(d.guest_email_sent_at).toBeTruthy();
    expect(d.venue_email_sent_at).toBeTruthy();
  });

  it("callback 重送 / PaymentResult 重整不再重複寄信", async () => {
    seedDraft();
    await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "frontend" });
    await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "callback" });
    await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "frontend" });
    expect(emails.sent).toHaveLength(2);
  });

  it("寄信一次性由 DB 欄位判斷，不依賴前端 flag：欄位已填則不再寄", async () => {
    const d = seedDraft();
    d.converted_order_id = "order-pre";
    d.status = "converted";
    d.guest_email_sent_at = new Date().toISOString();
    d.venue_email_sent_at = new Date().toISOString();
    db.orders.push({ id: "order-pre", order_number: "PRE123", accommodation_id: "acc-1", total_price: 10000, paid_amount: 3000 });
    const r = await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "callback" });
    expect(r.alreadyConverted).toBe(true);
    expect(emails.sent).toHaveLength(0);
  });
});

/* ══════════════════ [concurrency] ══════════════════ */

describe("[concurrency] 前端回程 × TapPay callback 同時完成", () => {
  it("CASE 9: 兩條路徑並行 → 最多一張 order、一筆 commission、兩封信", async () => {
    seedDraft();
    const [a, b] = await Promise.all([
      completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "frontend" }),
      completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "callback" }),
    ]);
    expect(db.orders).toHaveLength(1);
    expect(db.group_buy_commissions).toHaveLength(1);
    expect(emails.sent).toHaveLength(2);
    // 其中一方成功建單，另一方為 alreadyConverted 或 202 處理中
    const outcomes = [a, b].map((r) => (r.ok ? (r.alreadyConverted ? "already" : "created") : `err${r.status}`));
    expect(outcomes.filter((o) => o === "created").length).toBeLessThanOrEqual(1);
  });

  it("另一方仍在處理中（claim 未逾時）→ 回 202，不建第二張", async () => {
    seedDraft({ status: "paid" }); // 已被搶佔且未過 stale 視窗
    const r = await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "callback" });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(202);
    expect(db.orders).toHaveLength(0);
  });

  it("CASE 16: 已付款超過 stale 視窗仍未轉單 → 允許重新搶佔並補建（仍只會有一張 order）", async () => {
    seedDraft({ status: "paid", updated_at: new Date(Date.now() - 10 * 60_000).toISOString() });
    const r = await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "callback" });
    expect(r.ok).toBe(true);
    expect(db.orders).toHaveLength(1);
    const again = await completeGroupBuyCreditOrder(admin, { draftId: DRAFT_ID, source: "frontend" });
    expect(again.alreadyConverted).toBe(true);
    expect(db.orders).toHaveLength(1);
  });
});
