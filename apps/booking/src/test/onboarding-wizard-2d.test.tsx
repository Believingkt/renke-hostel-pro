import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const saveBasicInfo = vi.fn();
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@lakeze/shared/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@lakeze/shared/hooks/use-alias-prefix", () => ({ useAliasPrefix: () => ({ withPrefix: (p: string) => `/a${p}` }) }));
vi.mock("@/lib/onboarding/wizardApi", async (orig) => {
  const real = await orig<typeof import("@/lib/onboarding/wizardApi")>();
  return { ...real, wizardApi: { ...real.wizardApi, saveBasicInfo: (...a: unknown[]) => saveBasicInfo(...a) } };
});

import { basicInfoErrors, phoneError } from "@/lib/onboarding/basicInfo";
import { stepDone, WIZARD_STEPS } from "@/lib/onboarding/wizardSteps";
import { TIER_HINTS } from "@/lib/onboarding/wizardApi";
import { BasicInfoStep } from "@/components/onboarding-wizard/BasicInfoStep";
import { PrecheckList } from "@/components/onboarding-wizard/PrecheckList";
import { FlowChooser } from "@/components/onboarding-wizard/FlowChooser";
import { WizardStepper } from "@/components/onboarding-wizard/WizardStepper";

const desc30 = "好".repeat(30);
const okInfo = { name: "礁溪山嵐", address: "宜蘭縣礁溪鄉溫泉路 1 號", phone: "03-987-6543", description: desc30 };

describe("2d 基本資料規則（與後端 wizard_basic_info_errors 相同）", () => {
  it("合法資料沒有錯誤；去頭尾空白後判斷", () => {
    expect(basicInfoErrors(okInfo)).toEqual({});
    expect(basicInfoErrors({ ...okInfo, name: "  礁溪  " })).toEqual({});
  });
  it("名稱 2～50、地址 5～200、介紹 30～3000 字", () => {
    expect(basicInfoErrors({ ...okInfo, name: "甲" }).name).toBe("名稱需 2～50 字");
    expect(basicInfoErrors({ ...okInfo, name: "名".repeat(51) }).name).toBe("名稱需 2～50 字");
    expect(basicInfoErrors({ ...okInfo, address: "台北市內" }).address).toBe("地址需 5～200 字");
    expect(basicInfoErrors({ ...okInfo, description: "好".repeat(29) }).description).toBe("介紹至少 30 字（目前 29 字）");
    expect(basicInfoErrors({ ...okInfo, description: "好".repeat(3001) }).description).toBe("介紹最多 3000 字");
    expect(Object.keys(basicInfoErrors({ name: "", address: "", phone: "", description: "" }))).toEqual(["name", "address", "phone", "description"]);
  });
  it("電話：8～15 位數字，可用 - + () 空白與 # 分機", () => {
    for (const ok of ["03-987-6543", "0912-345-678", "+886 912 345 678", "(02)2345-6789", "02-2345-6789#123"]) expect(phoneError(ok)).toBeNull();
    for (const bad of ["03-ABC-6543", "987-6543", "0912345678901234", "02-2345-6789#1234567", "02/2345/6789"]) expect(phoneError(bad)).toContain("電話格式不正確");
  });
});

describe("2d 步驟完成狀態（依開賣前檢查紅色項目）", () => {
  const res = { red: [{ key: "basic_info", label: "", ok: true, detail: "" }, { key: "room_types", label: "", ok: true, detail: "" }, { key: "packages", label: "", ok: true, detail: "" }, { key: "templates", label: "", ok: false, detail: "" }], yellow: [], red_ok: false, window_start: "", window_end: "" };
  it("基本資料步驟為第 1 步；方案需 packages＋templates 都過；季節價選填不打勾；送審看是否已送審", () => {
    expect(WIZARD_STEPS[0].key).toBe("basic");
    expect(stepDone("basic", res, false)).toBe(true);
    expect(stepDone("packages", res, false)).toBe(false);
    expect(stepDone("season", res, false)).toBe(false);
    expect(stepDone("inventory", res, false)).toBe(false);
    expect(stepDone("submit", res, true)).toBe(true);
  });
  it("步驟列：已完成顯示 ✓", () => {
    render(<WizardStepper current={1} done={[true, false, false, false, false, false]} onSelect={() => undefined} />);
    expect(screen.getByTestId("wizard-step-0-done")).toBeTruthy();
    expect(screen.getByTestId("wizard-step-1-todo")).toBeTruthy();
    expect(screen.getByTestId("wizard-step-3").textContent).toContain("選填");
  });
  it("三日型說明含星期與國定假日規則", () => {
    expect(TIER_HINTS.friday_sunday).toContain("週五、週日");
    expect(TIER_HINTS.weekend).toContain("國定假日");
  });
});

describe("2d 基本資料步驟", () => {
  beforeEach(() => saveBasicInfo.mockReset());
  const info = { ...okInfo, short_url_alias: "sanlan" };
  const renderStep = (locked = false) => render(<MemoryRouter><BasicInfoStep accommodationId="t" info={info} locked={locked} onSaved={() => undefined} /></MemoryRouter>);
  it("PMS 代號只顯示、不可改；有前往一般設定頁連結", () => {
    renderStep();
    const alias = screen.getByTestId("basic-info-alias") as HTMLInputElement;
    expect(alias.value).toBe("sanlan");
    expect(alias.disabled).toBe(true);
    expect(screen.getByTestId("basic-info-settings-link").getAttribute("href")).toBe("/a/admin/website-content?tab=basic-info");
  });
  it("欄位錯誤時不呼叫後端並顯示原因；修正後呼叫 wizard_save_basic_info", async () => {
    saveBasicInfo.mockResolvedValue({});
    renderStep();
    fireEvent.change(screen.getByTestId("basic-info-phone"), { target: { value: "abc" } });
    fireEvent.click(screen.getByTestId("basic-info-save-btn"));
    expect(saveBasicInfo).not.toHaveBeenCalled();
    expect(screen.getByText(/電話格式不正確/)).toBeTruthy();
    fireEvent.change(screen.getByTestId("basic-info-phone"), { target: { value: "03-987-6543" } });
    fireEvent.click(screen.getByTestId("basic-info-save-btn"));
    await waitFor(() => expect(saveBasicInfo).toHaveBeenCalledWith({ accommodationId: "t", ...okInfo }));
  });
  it("已送審：唯讀、沒有儲存按鈕", () => {
    renderStep(true);
    expect(screen.queryByTestId("basic-info-save-btn")).toBeNull();
    expect((screen.getByTestId("basic-info-name") as HTMLInputElement).disabled).toBe(true);
  });
});

describe("2d 館別開關與 OTA 顯示", () => {
  const result = {
    red: [{ key: "flags", label: "系統設定（總部）", ok: false, detail: "系統設定尚未完成，請聯絡總部", hq_detail: "新版價格頁（new_price_ui_enabled）未開" }],
    yellow: [], red_ok: false, window_start: "2026-10-22", window_end: "2027-04-21",
    ota_status: { owlting: true, hotelnabe: false, detail: "OwlTing：已開同步（對應完整）；Hotelnabe：未串接" },
  };
  it("業主：只看到白話說明，不顯示技術名稱與 OTA", () => {
    render(<PrecheckList result={result} audience="owner" />);
    expect(screen.getByTestId("precheck-red-flags").textContent).toContain("請聯絡總部");
    expect(screen.getByTestId("precheck-red-flags").textContent).not.toContain("new_price_ui_enabled");
    expect(screen.queryByTestId("precheck-ota-status")).toBeNull();
  });
  it("總部：顯示技術名稱與 OTA 狀態（僅供參考）", () => {
    render(<PrecheckList result={result} audience="hq" />);
    expect(screen.getByTestId("precheck-red-flags").textContent).toContain("new_price_ui_enabled");
    expect(screen.getByTestId("precheck-ota-status").textContent).toContain("不影響核准");
  });
});

describe("2d 類型大卡片", () => {
  it("顯示說明與適用情境，選取後有選取狀態", () => {
    const onChoose = vi.fn();
    const { rerender } = render(<FlowChooser value={null} onChoose={onChoose} />);
    expect(screen.getByTestId("wizard-flow-single").textContent).toContain("適合");
    fireEvent.click(screen.getByTestId("wizard-flow-multi"));
    expect(onChoose).toHaveBeenCalledWith("multi");
    rerender(<FlowChooser value="multi" onChoose={onChoose} />);
    expect(screen.getByTestId("wizard-flow-multi").getAttribute("aria-pressed")).toBe("true");
  });
});
