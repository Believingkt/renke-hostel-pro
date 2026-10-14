import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const PKGS = [
  { id: "p1", name: "12人包棟", enabled: true, sale_price: 17000, original_price: 30900,
    tier_prices: { weekday: { sale: 17000, original: 30900 }, friday_sunday: { sale: 19000, original: 34300 } } as any },
];
const P2 = { id: "p2", name: "8人包棟", enabled: true, sale_price: 12000, original_price: 15000,
  tier_prices: { weekday: { sale: 12000, original: 15000 } } as any };

const state = {
  flags: { newPriceUiEnabled: true, newOrderDialogEnabled: false, priceSyncMode: "package_original", loaded: true, failed: false },
  channel: "owlting" as string | null,
  rpcCalls: [] as Array<{ fn: string; args: any }>,
  pkgs: PKGS as any[],
  pkgError: null as null | { message: string },
  failAfterRpc: false,
};
const TPLS = [
  { template_name: "12人包棟", default_package_id: "p1" },
  { template_name: "12人包棟（平日專案）", default_package_id: "p1" },
];

vi.mock("@lakeze/shared/hooks/useAccommodationPriceFlags", () => ({
  useAccommodationPriceFlags: () => state.flags,
}));
vi.mock("@lakeze/shared/contexts/AccommodationContext", () => ({
  useAccommodation: () => ({ currentAccommodationId: "acc-1" }),
}));
vi.mock("@lakeze/shared/hooks/use-staff-permissions", () => ({
  useStaffPermissions: () => ({ canEdit: () => true, canView: () => true }),
}));
vi.mock("@lakeze/shared/hooks/use-alias-prefix", () => ({
  useAliasPrefix: () => ({ withPrefix: (u: string) => u, prefix: "" }),
}));
vi.mock("@/lib/owltingPackageRequirement", () => ({
  getAccommodationChannel: async () => state.channel,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@lakeze/shared/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => {
          const p: any = Promise.resolve({ data: TPLS, error: null });
          p.order = async () =>
            table === "accommodation_packages" && state.pkgError
              ? { data: null, error: state.pkgError }
              : { data: table === "accommodation_packages" ? state.pkgs : TPLS, error: null };
          return p;
        },
      }),
    }),
    rpc: async (fn: string, args: any) => {
      state.rpcCalls.push({ fn, args });
      // 模擬資料庫寫入：被儲存的方案換成新物件與新值，其他方案也換成新物件（值不變）
      state.pkgs = state.pkgs.map((p) => (p.id === args.p_package_id
        ? { ...p, sale_price: args.p_tier_prices.weekday.sale, original_price: args.p_tier_prices.weekday.original, tier_prices: args.p_tier_prices }
        : { ...p }));
      if (state.failAfterRpc) state.pkgError = { message: "network error" };
      return { data: { package_id: args.p_package_id, synced_template_ids: [], sync_mode: "package_original" }, error: null };
    },
  },
}));

import RoomPlans from "@/pages/admin/RoomPlans";

const renderPage = () => render(<MemoryRouter><RoomPlans /></MemoryRouter>);

describe("「房型與方案」頁：只在啟用館出現", () => {
  beforeEach(() => {
    state.flags = { newPriceUiEnabled: true, newOrderDialogEnabled: false, priceSyncMode: "package_original", loaded: true, failed: false };
    state.channel = "owlting";
    state.rpcCalls = [];
    state.pkgs = PKGS;
    state.pkgError = null;
    state.failAfterRpc = false;
  });

  it("啟用館：顯示方案卡片、三層價格、實際折數、同步專案名稱、OTA 與奧丁丁提示", async () => {
    renderPage();
    expect(await screen.findByTestId("room-plan-card-p1")).toBeTruthy();
    expect(screen.getByTestId("room-plans-ota-notice").textContent).toContain("OTA 售價請到 OwlNest／旭海後台調整");
    expect(screen.getByTestId("room-plan-discount-p1-weekday").textContent).toBe("原價 -45%");
    expect(screen.getByTestId("room-plan-sync-p1").textContent).toBe("此方案原價會同步到專案：12人包棟、12人包棟（平日專案）");
    expect(screen.getByTestId("room-plan-toggle-link-p1").getAttribute("href")).toBe("/admin/packages");
    expect(await screen.findByTestId("room-plans-owlting-notice")).toBeTruthy();
    expect(screen.queryByText(/刪除/)).toBeNull();
  });

  it("讀不到奧丁丁設定（非 owlting）時不顯示奧丁丁提示", async () => {
    state.channel = null;
    renderPage();
    await screen.findByTestId("room-plan-card-p1");
    expect(screen.queryByTestId("room-plans-owlting-notice")).toBeNull();
  });

  it("no_sync 館不顯示同步專案提示", async () => {
    state.flags = { ...state.flags, priceSyncMode: "no_sync" };
    renderPage();
    await screen.findByTestId("room-plan-card-p1");
    expect(screen.queryByTestId("room-plan-sync-p1")).toBeNull();
  });

  it("儲存呼叫 save_package_tier_prices，原價留空時送出等於售價", async () => {
    renderPage();
    await screen.findByTestId("room-plan-card-p1");
    fireEvent.change(screen.getByTestId("room-plan-sale-p1-weekend"), { target: { value: "23000" } });
    fireEvent.click(screen.getByTestId("room-plan-save-p1"));
    await waitFor(() => expect(state.rpcCalls).toHaveLength(1));
    expect(state.rpcCalls[0]).toEqual({
      fn: "save_package_tier_prices",
      args: {
        p_package_id: "p1",
        p_tier_prices: {
          weekday: { sale: 17000, original: 30900 },
          friday_sunday: { sale: 19000, original: 34300 },
          weekend: { sale: 23000, original: 23000 },
        },
      },
    });
  });

  it("原價低於售價時不呼叫 RPC 並顯示錯誤", async () => {
    renderPage();
    await screen.findByTestId("room-plan-card-p1");
    fireEvent.change(screen.getByTestId("room-plan-original-p1-weekday"), { target: { value: "100" } });
    fireEvent.click(screen.getByTestId("room-plan-save-p1"));
    expect((await screen.findByTestId("room-plan-errors-p1")).textContent).toContain("平日原價不得低於售價");
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("(a) 儲存後重讀方案失敗：卡片保留原資料並顯示錯誤提示", async () => {
    state.failAfterRpc = true;
    renderPage();
    await screen.findByTestId("room-plan-card-p1");
    expect(screen.queryByTestId("room-plans-load-error")).toBeNull();
    fireEvent.change(screen.getByTestId("room-plan-sale-p1-weekend"), { target: { value: "23000" } });
    fireEvent.click(screen.getByTestId("room-plan-save-p1"));
    expect((await screen.findByTestId("room-plans-load-error")).textContent).toBe("讀取方案失敗，請重新整理");
    expect(screen.getByTestId("room-plan-card-p1")).toBeTruthy();
    expect((screen.getByTestId("room-plan-sale-p1-weekday") as HTMLInputElement).value).toBe("17000");
  });

  it("(a) 首次讀取失敗：顯示錯誤提示", async () => {
    state.pkgError = { message: "permission denied" };
    renderPage();
    expect((await screen.findByTestId("room-plans-load-error")).textContent).toBe("讀取方案失敗，請重新整理");
  });

  it("(b) 修改第二張卡片後儲存第一張，第二張的輸入保留、第一張顯示資料庫值", async () => {
    state.pkgs = [PKGS[0], P2];
    renderPage();
    await screen.findByTestId("room-plan-card-p2");
    fireEvent.change(screen.getByTestId("room-plan-sale-p2-weekend"), { target: { value: "14000" } });
    fireEvent.change(screen.getByTestId("room-plan-original-p2-weekday"), { target: { value: "16000" } });
    fireEvent.change(screen.getByTestId("room-plan-sale-p1-weekend"), { target: { value: "23000" } });
    fireEvent.change(screen.getByTestId("room-plan-original-p1-weekend"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("room-plan-save-p1"));
    await waitFor(() => expect(state.rpcCalls).toHaveLength(1));
    // 第一張以資料庫實際值重設（原價留空 → RPC 寫入等於售價）
    await waitFor(() =>
      expect((screen.getByTestId("room-plan-original-p1-weekend") as HTMLInputElement).value).toBe("23000"));
    expect((screen.getByTestId("room-plan-sale-p2-weekend") as HTMLInputElement).value).toBe("14000");
    expect((screen.getByTestId("room-plan-original-p2-weekday") as HTMLInputElement).value).toBe("16000");
    expect(state.rpcCalls.every((c) => c.args.p_package_id === "p1")).toBe(true);
  });

  it("(c) 千分位金額「17,000」可儲存，送出 17000", async () => {
    renderPage();
    await screen.findByTestId("room-plan-card-p1");
    fireEvent.change(screen.getByTestId("room-plan-sale-p1-weekend"), { target: { value: "17,000" } });
    fireEvent.click(screen.getByTestId("room-plan-save-p1"));
    await waitFor(() => expect(state.rpcCalls).toHaveLength(1));
    expect(state.rpcCalls[0].args.p_tier_prices.weekend).toEqual({ sale: 17000, original: 17000 });
  });

  it("未啟用館：不顯示頁面內容", () => {
    state.flags = { ...state.flags, newPriceUiEnabled: false };
    renderPage();
    expect(screen.getByTestId("room-plans-disabled")).toBeTruthy();
    expect(screen.queryByTestId("room-plans-page")).toBeNull();
  });
});

describe("側欄：「房型與方案」只在啟用館出現", () => {
  it("adminMenu 子選單帶 requiresFlag，AppSidebar 依館別開關過濾", async () => {
    const { ADMIN_MENU_ITEMS } = await import("@lakeze/shared/config/adminMenu");
    const sub = ADMIN_MENU_ITEMS.flatMap((i: any) => i.subItems || []).find((s: any) => s.url === "/admin/room-plans");
    expect(sub?.requiresFlag).toBe("new_price_ui_enabled");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const sidebar = fs.readFileSync(path.resolve(__dirname, "../../../../../packages/shared/src/components/AppSidebar.tsx"), "utf8");
    expect(sidebar).toContain('subItem.requiresFlag !== "new_price_ui_enabled" || priceFlags.newPriceUiEnabled');
    expect(sidebar).toContain("item.subItems.filter(isSubItemVisible).map(");
  });
});
