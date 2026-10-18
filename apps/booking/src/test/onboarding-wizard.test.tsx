import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const precheck = vi.fn();
const submit = vi.fn();
const returnToOwner = vi.fn();
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@lakeze/shared/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/onboarding/wizardApi", async (orig) => {
  const real = await orig<typeof import("@/lib/onboarding/wizardApi")>();
  return { ...real, wizardApi: { ...real.wizardApi, precheck: (...a: unknown[]) => precheck(...a), submit: (...a: unknown[]) => submit(...a), returnToOwner: (...a: unknown[]) => returnToOwner(...a) } };
});

import { tierPriceError, addMonths } from "@/lib/onboarding/wizardApi";
import { SubmitStep } from "@/components/onboarding-wizard/SubmitStep";
import { ReviewStatusBanner } from "@/components/onboarding-wizard/ReviewStatusBanner";
import { OnboardingReviewPanel } from "@/components/headquarters/OnboardingReviewPanel";

const ok = { sale: 8000, original: 9000 };
const result = (redOk: boolean) => ({
  red: [{ key: "inventory", label: "每個房型有庫存", ok: redOk, detail: redOk ? "全部有庫存" : "沒有可訂庫存：雙人房" }],
  yellow: [{ key: "ota", label: "OTA 串接狀態（請確認）", needs_ack: true, detail: "OwlTing：未串接" }],
  red_ok: redOk, window_start: "2026-10-18", window_end: "2027-04-17",
});

describe("上架精靈：三日型價格前端檢查", () => {
  it("三日型都 > 0 且原價 ≥ 售價才通過", () => {
    expect(tierPriceError({ weekday: ok, friday_sunday: ok, weekend: ok })).toBeNull();
    expect(tierPriceError({ weekday: { sale: 0, original: 9000 }, friday_sunday: ok, weekend: ok })).toContain("平日");
    expect(tierPriceError({ weekday: ok, friday_sunday: ok, weekend: { sale: 8000, original: 0 } })).toContain("假日");
    expect(tierPriceError({ weekday: ok, weekend: ok })).toContain("旺日");
    expect(tierPriceError({ weekday: { sale: 9500, original: 9000 }, friday_sunday: ok, weekend: ok })).toContain("原價不得低於售價");
  });
  it("庫存預設區間：今天起 6 個月", () => {
    expect(addMonths("2026-10-18", 6)).toBe("2027-04-17");
  });
});

describe("上架精靈：送審", () => {
  beforeEach(() => { precheck.mockReset(); submit.mockReset(); });
  it("紅色未通過：送審按鈕停用", async () => {
    precheck.mockResolvedValue(result(false));
    render(<SubmitStep accommodationId="t" locked={false} onSubmitted={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("precheck-summary").textContent).toContain("還有紅色項目未通過"));
    expect((screen.getByTestId("wizard-submit-btn") as HTMLButtonElement).disabled).toBe(true);
  });
  it("紅色全過但未勾 OTA：停用；勾選後可送審", async () => {
    precheck.mockResolvedValue(result(true));
    submit.mockResolvedValue(result(true));
    const onSubmitted = vi.fn();
    render(<SubmitStep accommodationId="t" locked={false} onSubmitted={onSubmitted} />);
    await waitFor(() => expect(screen.getByTestId("wizard-submit-btn")).toBeTruthy());
    expect((screen.getByTestId("wizard-submit-btn") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("ota-ack-checkbox"));
    fireEvent.click(screen.getByTestId("wizard-submit-btn"));
    await waitFor(() => expect(submit).toHaveBeenCalledWith("t", true));
    expect(onSubmitted).toHaveBeenCalled();
  });
  it("已送審（唯讀）：不顯示送審按鈕", async () => {
    precheck.mockResolvedValue(result(true));
    render(<SubmitStep accommodationId="t" locked onSubmitted={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("precheck-list")).toBeTruthy());
    expect(screen.queryByTestId("wizard-submit-btn")).toBeNull();
  });
  it("退回：PMS 端顯示退回原因", () => {
    render(<ReviewStatusBanner finalCheck={{ status: "returned", submitted_at: null, returned_at: null, return_reason: "照片不足" }} />);
    expect(screen.getByTestId("wizard-return-reason").textContent).toContain("照片不足");
  });
});

describe("總部：核准對話框的檢查結果與退回", () => {
  beforeEach(() => { precheck.mockReset(); returnToOwner.mockReset(); });
  it("待核准：顯示檢查結果，填原因後退回", async () => {
    precheck.mockResolvedValue(result(true));
    returnToOwner.mockResolvedValue(null);
    const onReturned = vi.fn();
    render(<OnboardingReviewPanel accommodationId="t" reviewStatus="submitted" onReturned={onReturned} />);
    await waitFor(() => expect(screen.getByTestId("precheck-summary").textContent).toContain("紅色項目全部通過"));
    fireEvent.click(screen.getByTestId("hq-return-btn"));
    fireEvent.change(screen.getByTestId("hq-return-reason"), { target: { value: "照片不足" } });
    fireEvent.click(screen.getByTestId("hq-return-confirm"));
    await waitFor(() => expect(returnToOwner).toHaveBeenCalledWith("t", "照片不足"));
    expect(onReturned).toHaveBeenCalled();
  });
  it("已退回：不再顯示退回按鈕", async () => {
    precheck.mockResolvedValue(result(false));
    render(<OnboardingReviewPanel accommodationId="t" reviewStatus="returned" onReturned={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("precheck-list")).toBeTruthy());
    expect(screen.queryByTestId("hq-return-btn")).toBeNull();
  });
});
