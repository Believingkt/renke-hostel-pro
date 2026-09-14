import { describe, it, expect } from "vitest";
import {
  evaluateSteps,
  progressOf,
  canFinalConfirm,
  futureWindow,
  ONBOARDING_MIN_SELLABLE_DAYS,
  ONBOARDING_WINDOW_DAYS,
  type OnboardingSource,
} from "../steps";

const TODAY = "2026-09-14";
const day = (n: number) =>
  new Date(new Date(`${TODAY}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

function base(overrides: Partial<OnboardingSource> = {}): OnboardingSource {
  return {
    today: TODAY,
    info: { name: "測試民宿", address: "台北市", phone: "0912345678", description: "介紹" },
    about: { section_title: "關於", section_description: "說明" },
    photoCount: 3,
    facilities: [{ is_available: true }],
    roomTypes: [{ id: "rt1", name: "雙人房", capacity: 2 }],
    roomPhotoRoomTypeIds: ["rt1"],
    pricingTemplates: [{ room_type_ids: ["rt1"] }],
    inventoryRows: Array.from({ length: 10 }, (_, i) => ({ date: day(i), available_rooms: 1 })),
    packages: [{ id: "pkg1", enabled: true }],
    packagePriceRows: Array.from({ length: 10 }, (_, i) => ({
      date: day(i),
      package_id: "pkg1",
      sale_price: 3000,
      is_available: true,
    })),
    bookingSettings: {
      payment_methods: ["credit_card"],
      deposit_percentage: 30,
      security_deposit_amount: 2000,
      free_cancel_days: 7,
    },
    notificationEmails: [],
    confirmations: {},
    ...overrides,
  };
}

const statusOf = (src: OnboardingSource, key: string) =>
  evaluateSteps(src).find((s) => s.key === key)!.status;

describe("上架引導判定", () => {
  it("視窗是 30 天、門檻是 7 天", () => {
    expect(ONBOARDING_WINDOW_DAYS).toBe(30);
    expect(ONBOARDING_MIN_SELLABLE_DAYS).toBe(7);
    expect(futureWindow(TODAY).size).toBe(30);
  });

  it("庫存：剛好 6 個可售日 → 未完成；剛好 7 個 → 完成", () => {
    const six = base({ inventoryRows: Array.from({ length: 6 }, (_, i) => ({ date: day(i), available_rooms: 2 })) });
    const seven = base({ inventoryRows: Array.from({ length: 7 }, (_, i) => ({ date: day(i), available_rooms: 2 })) });
    expect(statusOf(six, "inventory")).toBe("pending");
    expect(statusOf(seven, "inventory")).toBe("completed");
  });

  it("庫存：同一天多個房型不重複計算（6 天 × 3 房型仍為未完成）", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ date: day(i), available_rooms: 1 })).flatMap((r) => [r, r, r]);
    expect(statusOf(base({ inventoryRows: rows }), "inventory")).toBe("pending");
  });

  it("庫存：可售日在 30 天視窗外不計入", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ date: day(35 + i), available_rooms: 2 }));
    expect(statusOf(base({ inventoryRows: rows }), "inventory")).toBe("pending");
  });

  it("庫存：第 8～14 天共 7 天（非最前 7 天）也算完成，證明是 30 天視窗不是 7 天視窗", () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ date: day(8 + i), available_rooms: 1 }));
    expect(statusOf(base({ inventoryRows: rows }), "inventory")).toBe("completed");
  });

  it("前台價格：6 天 → 未完成、7 天 → 完成；價格 0 或未啟用方案不計入", () => {
    const mk = (n: number, extra: Partial<{ sale_price: number; package_id: string }> = {}) =>
      Array.from({ length: n }, (_, i) => ({
        date: day(i),
        package_id: "pkg1",
        sale_price: 3000,
        is_available: true,
        ...extra,
      }));
    expect(statusOf(base({ packagePriceRows: mk(6) }), "package_prices")).toBe("pending");
    expect(statusOf(base({ packagePriceRows: mk(7) }), "package_prices")).toBe("completed");
    expect(statusOf(base({ packagePriceRows: mk(10, { sale_price: 0 }) }), "package_prices")).toBe("pending");
    expect(statusOf(base({ packagePriceRows: mk(10, { package_id: "other" }) }), "package_prices")).toBe("pending");
  });

  it("設施：讀 is_available，全為 false 即未完成", () => {
    expect(statusOf(base({ facilities: [{ is_available: false }] }), "facilities")).toBe("pending");
    expect(statusOf(base({ facilities: [{ is_available: null }] }), "facilities")).toBe("completed");
    expect(statusOf(base({ facilities: [] }), "facilities")).toBe("pending");
  });

  it("第 13 步通知信箱：非空＝完成、空＝待確認，且不影響完成度分母與百分比", () => {
    const empty = base();
    const filled = base({ notificationEmails: ["venue@example.com"] });
    expect(statusOf(empty, "notification_emails")).toBe("pending");
    expect(statusOf(filled, "notification_emails")).toBe("completed");
    expect(progressOf(evaluateSteps(empty))).toEqual(progressOf(evaluateSteps(filled)));
  });

  it("訂金與押金為總部設定，狀態為 hq、不計入分母", () => {
    const steps = evaluateSteps(base());
    expect(steps.find((s) => s.key === "deposit_percentage")!.status).toBe("hq");
    expect(steps.find((s) => s.key === "security_deposit")!.status).toBe("hq");
    expect(progressOf(steps).total).toBe(10);
  });

  it("第 15 步：1–10 全綠但第 14 步未確認時不可按；第 14 步確認後才可按", () => {
    const withoutS14 = evaluateSteps(base());
    expect(progressOf(withoutS14)).toEqual({ done: 10, total: 10 });
    expect(canFinalConfirm(withoutS14)).toBe(false);

    const withS14 = evaluateSteps(base({ confirmations: { cancellation_policy: "confirmed" } }));
    expect(canFinalConfirm(withS14)).toBe(true);

    const incomplete = evaluateSteps(
      base({ confirmations: { cancellation_policy: "confirmed" }, packages: [{ id: "pkg1", enabled: false }] }),
    );
    expect(canFinalConfirm(incomplete)).toBe(false);
  });

  it("基本資料任一欄位缺漏即未完成", () => {
    expect(statusOf(base({ info: { name: "X", address: "", phone: "09", description: "d" } }), "basic_info")).toBe("pending");
  });

  it("房型：缺照片或缺人數即未完成", () => {
    expect(statusOf(base({ roomPhotoRoomTypeIds: [] }), "room_types")).toBe("pending");
    expect(statusOf(base({ roomTypes: [{ id: "rt1", name: "房", capacity: 0 }] }), "capacity")).toBe("pending");
  });
});
