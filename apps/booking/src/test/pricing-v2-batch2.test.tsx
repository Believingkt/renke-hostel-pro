import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const tables: Record<string, any[]> = {};
const rpc = vi.fn();
let flagOn = true;

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@lakeze/shared/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => {
      const b: any = {};
      for (const m of ["select", "eq", "in", "order"]) b[m] = () => b;
      b.then = (res: any) => Promise.resolve({ data: tables[t] ?? [], error: null }).then(res);
      return b;
    },
    rpc: (...a: any[]) => rpc(...a),
  },
}));
vi.mock("@lakeze/shared/hooks/useAccommodationPriceFlags", () => ({
  useAccommodationPriceFlags: () => ({ loaded: true, failed: false, newPriceUiEnabled: flagOn, priceSyncMode: "off" }),
}));

import { PackageSeasonsCard, PRICE_PRIORITY_TEXT } from "@/components/pricing/PackageSeasonsCard";
import { PricingTemplateGroupsCard } from "@/components/pricing/PricingTemplateGroupsCard";
import { DiscountCodeGroupBinding } from "@/components/pricing/DiscountCodeGroupBinding";
import { DiscountScopeSelector } from "@/components/discount/DiscountScopeSelector";
import { checkRequiredOriginals } from "@/lib/packageOriginalRequired";

const PKG = { id: "p1", name: "海景方案", tier_prices: { weekday: { sale: 3000, original: 4000 }, weekend: { sale: 5000, original: 6000 } } };

beforeEach(() => {
  rpc.mockReset();
  flagOn = true;
  for (const k of Object.keys(tables)) delete tables[k];
});

describe("季節區段", () => {
  it("顯示優先順序說明、新增時只送方案已有的日型", async () => {
    rpc.mockResolvedValue({ data: { written: 12, season_id: "s9" }, error: null });
    render(<PackageSeasonsCard pkg={PKG} canEdit />);
    expect(screen.getByTestId("price-priority-note").textContent).toBe(PRICE_PRIORITY_TEXT);
    fireEvent.click(screen.getByTestId("season-add-p1"));
    expect(screen.queryByTestId("season-sale-friday_sunday")).toBeNull();
    fireEvent.change(screen.getByTestId("season-name"), { target: { value: "暑假" } });
    fireEvent.change(screen.getByTestId("season-from"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByTestId("season-to"), { target: { value: "2026-08-31" } });
    fireEvent.change(screen.getByTestId("season-sale-weekday"), { target: { value: "3500" } });
    fireEvent.change(screen.getByTestId("season-original-weekday"), { target: { value: "4500" } });
    fireEvent.change(screen.getByTestId("season-sale-weekend"), { target: { value: "5500" } });
    fireEvent.change(screen.getByTestId("season-original-weekend"), { target: { value: "6500" } });
    fireEvent.click(screen.getByTestId("season-save"));
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith("save_package_season", {
      p_package_id: "p1", p_season_id: null, p_name: "暑假", p_date_from: "2026-07-01", p_date_to: "2026-08-31",
      p_tier_prices: { weekday: { sale: 3500, original: 4500 }, weekend: { sale: 5500, original: 6500 } },
    });
    await waitFor(() => expect(screen.queryByTestId("season-form")).toBeNull());
  });

  it("編輯帶 season_id；日期重疊時顯示 RPC 中文訊息", async () => {
    tables.package_seasons = [{ id: "s1", name: "暑假", date_from: "2026-07-01", date_to: "2026-08-31", tier_prices: PKG.tier_prices }];
    rpc.mockResolvedValue({ data: null, error: { message: "與同方案其他季節區段的日期重疊" } });
    render(<PackageSeasonsCard pkg={PKG} canEdit />);
    await waitFor(() => screen.getByTestId("season-row-s1"));
    fireEvent.click(screen.getByTestId("season-edit-s1"));
    expect((screen.getByTestId("season-sale-weekday") as HTMLInputElement).value).toBe("3000");
    fireEvent.click(screen.getByTestId("season-save"));
    await waitFor(() => expect(screen.getByTestId("season-error-p1").textContent).toBe("與同方案其他季節區段的日期重疊"));
    expect(rpc.mock.calls[0][1].p_season_id).toBe("s1");
    expect(screen.getByTestId("season-form")).toBeTruthy();
  });

  it("刪除要按兩次，呼叫 delete_package_season", async () => {
    tables.package_seasons = [{ id: "s1", name: "暑假", date_from: "2026-07-01", date_to: "2026-08-31", tier_prices: {} }];
    rpc.mockResolvedValue({ data: {}, error: null });
    render(<PackageSeasonsCard pkg={PKG} canEdit />);
    await waitFor(() => screen.getByTestId("season-delete-s1"));
    fireEvent.click(screen.getByTestId("season-delete-s1"));
    expect(rpc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("season-delete-confirm-s1"));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("delete_package_season", { p_season_id: "s1" }));
  });

  it("沒有編輯權限看不到新增／編輯／刪除", async () => {
    tables.package_seasons = [{ id: "s1", name: "暑假", date_from: "2026-07-01", date_to: "2026-08-31", tier_prices: {} }];
    render(<PackageSeasonsCard pkg={PKG} canEdit={false} />);
    await waitFor(() => screen.getByTestId("season-row-s1"));
    expect(screen.queryByTestId("season-add-p1")).toBeNull();
    expect(screen.queryByTestId("season-edit-s1")).toBeNull();
  });
});

describe("專案群組", () => {
  it("建立群組、設定成員；已屬於其他群組的專案不能勾", async () => {
    tables.pricing_template_groups = [{ id: "g1", name: "早鳥" }, { id: "g2", name: "連住" }];
    tables.pricing_template_group_members = [{ template_id: "t3", group_id: "g2" }];
    tables.pricing_templates = [{ id: "t1", template_name: "A" }, { id: "t2", template_name: "B" }, { id: "t3", template_name: "C" }];
    rpc.mockResolvedValue({ data: 2, error: null });
    render(<PricingTemplateGroupsCard accommodationId="acc" canEdit />);
    await waitFor(() => screen.getByTestId("template-group-g1"));
    expect((screen.getByTestId("template-group-member-g1-t3") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("template-group-member-g1-t1"));
    fireEvent.click(screen.getByTestId("template-group-member-g1-t2"));
    fireEvent.click(screen.getByTestId("template-group-save-members-g1"));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_pricing_template_group_members", { p_group_id: "g1", p_template_ids: ["t1", "t2"] }));
    fireEvent.change(screen.getByTestId("template-group-new-name"), { target: { value: "週末" } });
    fireEvent.click(screen.getByTestId("template-group-create"));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("save_pricing_template_group", { p_accommodation_id: "acc", p_group_id: null, p_name: "週末" }));
  });

  it("改群組名稱", async () => {
    tables.pricing_template_groups = [{ id: "g1", name: "早鳥" }];
    rpc.mockResolvedValue({ data: "g1", error: null });
    render(<PricingTemplateGroupsCard accommodationId="acc" canEdit />);
    await waitFor(() => screen.getByTestId("template-group-name-g1"));
    fireEvent.change(screen.getByTestId("template-group-name-g1"), { target: { value: "早鳥 60 天" } });
    fireEvent.click(screen.getByTestId("template-group-rename-g1"));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("save_pricing_template_group", { p_accommodation_id: "acc", p_group_id: "g1", p_name: "早鳥 60 天" }));
  });
});

function Harness({ scopeMode = "pricing_template" as const }) {
  const [bound, setBound] = useState(false);
  const [sel, setSel] = useState<string[]>(["t1"]);
  return (
    <>
      <DiscountScopeSelector mode={scopeMode} roomTypes={[]} pricingTemplates={[{ id: "t1", name: "A" }, { id: "t2", name: "B" }]}
        selectedRoomTypeIds={[]} onChangeRoomTypes={() => {}} selectedTemplateIds={sel} onChangeTemplates={setSel}
        idPrefix="edit-room" readOnly={bound && scopeMode === "pricing_template"} />
      <DiscountCodeGroupBinding discountCodeId="dc1" accommodationId="acc" scopeMode={scopeMode} onBoundChange={setBound} onSynced={setSel} />
    </>
  );
}

describe("折扣碼綁定專案群組", () => {
  it("綁定後適用專案唯讀、顯示「由專案群組自動同步」，並帶入同步結果", async () => {
    tables.pricing_template_groups = [{ id: "g1", name: "早鳥" }];
    tables.discount_code_template_groups = [];
    rpc.mockResolvedValue({ data: ["t1", "t2"], error: null });
    render(<Harness />);
    await waitFor(() => screen.getByTestId("discount-group-option-g1"));
    expect((screen.getByTestId("edit-room-scope-t2") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("discount-group-option-g1"));
    fireEvent.click(screen.getByTestId("discount-group-binding-save"));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("set_discount_code_template_groups", { p_discount_code_id: "dc1", p_group_ids: ["g1"] }));
    await waitFor(() => expect((screen.getByTestId("edit-room-scope-t2") as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByTestId("edit-room-scope-readonly").textContent).toBe("由專案群組自動同步");
    expect(screen.getByTestId("edit-room-scope-t2").getAttribute("data-state")).toBe("checked");
  });

  it("已綁定的碼一打開就是唯讀", async () => {
    tables.pricing_template_groups = [{ id: "g1", name: "早鳥" }];
    tables.discount_code_template_groups = [{ group_id: "g1" }];
    render(<Harness />);
    await waitFor(() => expect((screen.getByTestId("edit-room-scope-t1") as HTMLButtonElement).disabled).toBe(true));
  });

  it("沒開新價格頁的館：看不到綁定選項、適用專案可編輯", async () => {
    flagOn = false;
    render(<Harness />);
    expect(screen.queryByTestId("discount-group-binding")).toBeNull();
    expect(screen.queryByTestId("discount-group-binding-na")).toBeNull();
    expect((screen.getByTestId("edit-room-scope-t1") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("原價必填", () => {
  const base = { sale_price: 3000, original_price: 4000 };
  it("已啟用層級缺原價、原價 <= 0、原價低於售價都擋，並標出層級", () => {
    expect(checkRequiredOriginals({ ...base, tier_prices: { weekday: { sale: 3000, original: null } } }).badTiers).toEqual(["weekday"]);
    expect(checkRequiredOriginals({ ...base, tier_prices: { weekend: { sale: 5000, original: 0 } } }).errors).toEqual(["假日原價必填，且必須大於 0"]);
    expect(checkRequiredOriginals({ ...base, tier_prices: { friday_sunday: { sale: 5000, original: 4000 } } }).errors).toEqual(["旺日原價不能低於售價"]);
  });
  it("方案原價空白、<= 0、低於售價都擋", () => {
    expect(checkRequiredOriginals({ sale_price: 3000, original_price: null, tier_prices: {} }).packageOriginalBad).toBe(true);
    expect(checkRequiredOriginals({ sale_price: 3000, original_price: 0, tier_prices: {} }).packageOriginalBad).toBe(true);
    expect(checkRequiredOriginals({ sale_price: 3000, original_price: 2000, tier_prices: {} }).errors).toEqual(["方案原價不能低於售價"]);
  });
  it("只有 weekday 的方案、沒有 weekend 的方案都能存", () => {
    expect(checkRequiredOriginals({ ...base, tier_prices: { weekday: { sale: 3000, original: 4000 } } }).errors).toEqual([]);
    expect(checkRequiredOriginals({ ...base, tier_prices: { weekday: { sale: 3000, original: 4000 }, friday_sunday: { sale: 3500, original: 4500 } } }).errors).toEqual([]);
  });
  it("沒填售價的層級視為未啟用", () => {
    expect(checkRequiredOriginals({ ...base, tier_prices: { weekend: { sale: 0, original: null } } }).errors).toEqual([]);
  });
});

describe("只對新價格頁館別生效（原始碼接線檢查）", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), "utf8");
  it("AdminPackages 原價必填只在 newPriceUiEnabled 且可改價時檢查", () => {
    const src = read("../pages/AdminPackages.tsx");
    expect(src).toContain("if (priceFlags.newPriceUiEnabled && !lockPrices) {\n      const chk = checkRequiredOriginals(form);");
  });
  it("季節區段、專案群組只放在 RoomPlans（未啟用館整頁不渲染）", () => {
    const src = read("../pages/admin/RoomPlans.tsx");
    const disabledAt = src.indexOf('data-testid="room-plans-disabled"');
    expect(disabledAt).toBeGreaterThan(0);
    expect(src.indexOf("<PackageSeasonsCard")).toBeGreaterThan(disabledAt);
    expect(src.indexOf("<PricingTemplateGroupsCard")).toBeGreaterThan(disabledAt);
  });
  it("KolDiscount 綁定群組時不覆寫 applicable_pricing_template_ids", () => {
    const src = read("../pages/KolDiscount.tsx");
    expect(src).toContain("...(groupBound ? {} : { applicable_pricing_template_ids: selectedTemplates }),");
  });
});
