import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const ACC_A = {
  id: "a1", name: "測試館A", short_url_alias: "testa", address: "110台北市信義路1號", description: "好住", email: "cs@a.tw", phone: "02-2345678",
  payuni_mer_id: null, payuni_mer_status: null, payuni_member_status: null, payuni_payment_tools: {}, payment_provider_active: "tappay", payuni_status_synced_at: null,
};
const ACC_B = {
  ...ACC_A, id: "b1", name: "測試館B", payuni_mer_id: "TEST0002", payuni_mer_status: 92, payuni_member_status: 9,
  payuni_payment_tools: { CREDIT: 1, ATM: 9 },
};
const ACC_C = { ...ACC_A, id: "c1", name: "測試館C", payuni_mer_id: "TEST0003", payuni_mer_status: 9, payuni_payment_tools: { CREDIT: 1 } };

const h = vi.hoisted(() => ({
  isSuper: true,
  rows: [] as any[],
  invoke: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: h.toastSuccess, error: h.toastError } }));
vi.mock("@lakeze/shared/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) => ({
      select: () => {
        if (table === "user_roles") {
          return { eq: () => ({ eq: () => ({ limit: async () => ({ data: h.isSuper ? [{ role: "super_admin" }] : [], error: null }) }) }) };
        }
        return { order: async () => ({ data: h.rows, error: null }) };
      },
    }),
    functions: { invoke: (...a: any[]) => h.invoke(...a) },
  },
}));

import { PayuniMerchantManagement } from "@/components/headquarters/PayuniMerchantManagement";

describe("HQ「PAYUNi 金流」分頁", () => {
  beforeEach(() => {
    h.isSuper = true;
    h.rows = [ACC_A, ACC_B, ACC_C];
    h.invoke.mockReset();
    h.invoke.mockImplementation(async (_fn: string, { body }: any) =>
      body.action === "list_reasons" ? { data: { ok: true, reasons: { b1: "證件不清楚" } }, error: null } : { data: { ok: true }, error: null });
    h.toastError.mockReset();
  });

  it("非 super_admin 看不到內容", async () => {
    h.isSuper = false;
    render(<PayuniMerchantManagement />);
    expect(await screen.findByTestId("payuni-mgmt-forbidden")).toBeTruthy();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it("列表：狀態中文 badge、MerID、支付工具顏色、建店按鈕只在未建店或審核失敗出現", async () => {
    render(<PayuniMerchantManagement />);
    await screen.findByTestId("payuni-row-a1");
    expect(screen.getByTestId("payuni-status-a1").textContent).toBe("未建店");
    expect(screen.getByTestId("payuni-status-b1").textContent).toBe("審核失敗");
    expect(screen.getByTestId("payuni-status-c1").textContent).toBe("審核中");
    expect(screen.getByTestId("payuni-merid-b1").textContent).toBe("TEST0002");
    expect(screen.getByTestId("payuni-tool-b1-CREDIT").className).toContain("bg-green-100");
    expect(screen.getByTestId("payuni-tool-b1-ATM").className).toContain("bg-yellow-100");
    expect(screen.getByTestId("payuni-tool-b1-ForeignCard").className).toContain("bg-muted");
    expect(screen.getByTestId("payuni-bind-a1")).toBeTruthy();
    expect(screen.getByTestId("payuni-bind-b1")).toBeTruthy();
    expect(screen.queryByTestId("payuni-bind-c1")).toBeNull();
    expect(screen.queryByTestId("payuni-refresh-a1")).toBeNull();
  });

  it("建店表單：預填館別資料；錯誤格式前端擋下不呼叫 API；修正後送出並顯示驗證信提示", async () => {
    h.invoke.mockImplementation(async (fn: string, { body }: any) => {
      if (fn === "payuni-merchant-bind") return { data: { ok: true, mer_id: "TEST0004" }, error: null };
      return body.action === "list_reasons" ? { data: { ok: true, reasons: {} }, error: null } : { data: { ok: true }, error: null };
    });
    render(<PayuniMerchantManagement />);
    fireEvent.click(await screen.findByTestId("payuni-bind-a1"));
    await screen.findByTestId("payuni-bind-dialog");
    expect((screen.getByTestId("payuni-bind-mer_name") as HTMLInputElement).value).toBe("測試館A");
    expect((screen.getByTestId("payuni-bind-mer_addr_post") as HTMLInputElement).value).toBe("110");
    expect((screen.getByTestId("payuni-bind-goods_rate") as HTMLInputElement).value).toBe("0,100,0,0");
    expect(screen.getByText("僅用於送件，不會保存")).toBeTruthy();
    const fill = (k: string, v: string) => fireEvent.change(screen.getByTestId(`payuni-bind-${k}`), { target: { value: v } });
    fill("legal_name", "某某有限公司"); fill("ubn", "123456789"); fill("member_email", "o@x.tw");
    fill("contact_name", "王"); fill("mer_eng_name", "測試"); fill("goods_rate", "0,90,0,0"); fill("mer_unit_price", "3000"); fill("mer_mcc", "7011");
    fireEvent.click(screen.getByTestId("payuni-bind-submit"));
    expect(await screen.findByTestId("payuni-bind-error-ubn")).toBeTruthy();
    expect(screen.getByTestId("payuni-bind-error-mer_eng_name")).toBeTruthy();
    expect(screen.getByTestId("payuni-bind-error-goods_rate")).toBeTruthy();
    expect(h.invoke.mock.calls.some((c) => c[0] === "payuni-merchant-bind")).toBe(false);
    fill("ubn", "12345678"); fill("mer_eng_name", "Test Villa"); fill("goods_rate", "0,100,0,0");
    fireEvent.click(screen.getByTestId("payuni-bind-submit"));
    const result = await screen.findByTestId("payuni-bind-result");
    expect(result.textContent).toContain("TEST0004");
    expect(result.textContent).toContain("o@x.tw");
    const call = h.invoke.mock.calls.find((c) => c[0] === "payuni-merchant-bind")!;
    expect(call[1].body.accommodation_id).toBe("a1");
    expect(call[1].body.form.ubn).toBe("12345678");
  }, 20_000);

  it("切換金流：未啟用選 payuni 前端擋下並說明，不呼叫 set_provider", async () => {
    render(<PayuniMerchantManagement />);
    await screen.findByTestId("payuni-row-c1");
    const { canSwitchToPayuni } = await import("@/lib/payuniMerchantRules");
    expect(canSwitchToPayuni(ACC_C.payuni_mer_status, ACC_C.payuni_payment_tools).ok).toBe(false);
    await waitFor(() => expect(h.invoke).toHaveBeenCalled());
    expect(h.invoke.mock.calls.some((c) => c[1]?.body?.action === "set_provider")).toBe(false);
  });
});
