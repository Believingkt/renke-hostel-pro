import { describe, expect, it } from "vitest";
import {
  ERROR_LIFECYCLE,
  IDLE_LIFECYCLE,
  LOADING_LIFECYCLE,
  checkDelete,
  checkDeactivation,
  summarizeFutureUsage,
  type AmenityLifecycle,
} from "@/lib/amenityLifecycleGuard";

const TODAY = "2026-08-29";

const ready = (over: Partial<AmenityLifecycle> = {}): AmenityLifecycle => ({
  status: "ready",
  futureOrderCount: 0,
  nearestCheckIn: null,
  hasAnyAllocation: false,
  ...over,
});

const deact = (lifecycle: AmenityLifecycle) =>
  checkDeactivation({ isEditing: true, wasActive: true, nextActive: false, lifecycle });

describe("P2-2C 備品 lifecycle guard", () => {
  it("CASE A｜未來有 allocation → 不可停用", () => {
    const summary = summarizeFutureUsage(
      [
        {
          orders: {
            check_in_date: "2026-09-26",
            check_out_date: "2026-09-28",
            order_status: "confirmed",
          },
        },
      ],
      TODAY,
    );
    expect(summary.futureOrderCount).toBe(1);
    expect(summary.nearestCheckIn).toBe("2026-09-26");
    const res = deact(ready({ ...summary, hasAnyAllocation: true }));
    expect(res.canSave).toBe(false);
    expect(res.error).toContain("2026-09-26");
  });

  it("CASE B｜只有歷史 allocation → 可以停用", () => {
    const summary = summarizeFutureUsage(
      [
        {
          orders: {
            check_in_date: "2026-07-01",
            check_out_date: "2026-07-03",
            order_status: "confirmed",
          },
        },
      ],
      TODAY,
    );
    expect(summary.futureOrderCount).toBe(0);
    expect(deact(ready({ ...summary, hasAnyAllocation: true })).canSave).toBe(true);
  });

  it("CASE C｜未來但 cancelled → 不阻擋停用", () => {
    const summary = summarizeFutureUsage(
      [
        {
          orders: {
            check_in_date: "2026-09-26",
            check_out_date: "2026-09-28",
            order_status: "cancelled",
          },
        },
      ],
      TODAY,
    );
    expect(summary.futureOrderCount).toBe(0);
    expect(deact(ready({ ...summary, hasAnyAllocation: true })).canSave).toBe(true);
  });

  it("CASE C-2｜今天退房（最後住宿夜為昨天）→ 不阻擋停用", () => {
    const summary = summarizeFutureUsage(
      [
        {
          orders: {
            check_in_date: "2026-08-27",
            check_out_date: "2026-08-29",
            order_status: "confirmed",
          },
        },
      ],
      TODAY,
    );
    expect(summary.futureOrderCount).toBe(0);
  });

  it("CASE D｜重新啟用直接允許（即使 error / loading）", () => {
    const reactivate = (lifecycle: AmenityLifecycle) =>
      checkDeactivation({ isEditing: true, wasActive: false, nextActive: true, lifecycle });
    expect(reactivate(ERROR_LIFECYCLE).canSave).toBe(true);
    expect(reactivate(LOADING_LIFECYCLE).canSave).toBe(true);
  });

  it("CASE D-2｜改名／加總數等非停用操作不受 lifecycle 影響", () => {
    const res = checkDeactivation({
      isEditing: true,
      wasActive: true,
      nextActive: true,
      lifecycle: ERROR_LIFECYCLE,
    });
    expect(res.canSave).toBe(true);
    expect(res.error).toBeNull();
  });

  it("CASE E｜停用檢查 loading → Save disabled", () => {
    const res = deact(LOADING_LIFECYCLE);
    expect(res.canSave).toBe(false);
    expect(res.helper).toContain("正在確認");
    expect(deact(IDLE_LIFECYCLE).canSave).toBe(false);
  });

  it("CASE F｜停用檢查 failure → Save disabled + 可讀錯誤", () => {
    const res = deact(ERROR_LIFECYCLE);
    expect(res.canSave).toBe(false);
    expect(res.error).toBe("無法確認目前備品使用狀況，請稍後再試。");
  });

  it("CASE G｜已有歷史 allocation → 不可 DELETE", () => {
    const res = checkDelete(ready({ hasAnyAllocation: true }));
    expect(res.canDelete).toBe(false);
    expect(res.message).toContain("無法刪除");
  });

  it("CASE H｜只有 cancelled order 的 allocation → 仍不可 DELETE", () => {
    const rows = [
      {
        orders: {
          check_in_date: "2026-09-26",
          check_out_date: "2026-09-28",
          order_status: "cancelled",
        },
      },
    ];
    const summary = summarizeFutureUsage(rows, TODAY);
    const res = checkDelete(ready({ ...summary, hasAnyAllocation: rows.length > 0 }));
    expect(res.canDelete).toBe(false);
  });

  it("CASE I｜從未有 allocation → 可 DELETE", () => {
    const res = checkDelete(ready({ hasAnyAllocation: false }));
    expect(res.canDelete).toBe(true);
    expect(res.message).toBeNull();
  });

  it("CASE J｜loading / error 時不得允許 DELETE", () => {
    expect(checkDelete(LOADING_LIFECYCLE).canDelete).toBe(false);
    expect(checkDelete(ERROR_LIFECYCLE).canDelete).toBe(false);
    expect(checkDelete(IDLE_LIFECYCLE).canDelete).toBe(false);
  });
});
