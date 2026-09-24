import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { readFileSync } from "fs";
import { resolve } from "path";

const state = {
  row: null as Record<string, any> | null,
  updateError: null as { message: string } | null,
  updateRows: [{ order_id: "o1" }] as any[],
  insertRows: [{ order_id: "o1" }] as any[],
  persisted: null as Record<string, any> | null,
  updatePayloads: [] as Record<string, any>[],
  insertPayloads: [] as Record<string, any>[],
  selects: [] as string[],
  reads: 0,
};

const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("sonner", () => ({
  toast: { error: (...a: any[]) => toastError(...a), success: (...a: any[]) => toastSuccess(...a) },
}));

vi.mock("@lakeze/shared/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "super-1" } } }) },
    from: (table: string) => ({
      select: (cols: string) => {
        state.selects.push(`${table}:${cols}`);
        return {
          eq: () => ({
            maybeSingle: async () => {
              if (table === "profiles") return { data: { name: "超級管理員" }, error: null };
              state.reads += 1;
              return {
                data: state.reads === 1 ? state.row : (state.persisted ?? state.row),
                error: null,
              };
            },
          }),
        };
      },
      update: (payload: Record<string, any>) => {
        state.updatePayloads.push(payload);
        return {
          eq: () => ({
            select: async () => ({ data: state.updateRows, error: state.updateError }),
          }),
        };
      },
      insert: (payload: Record<string, any>) => {
        state.insertPayloads.push(payload);
        return { select: async () => ({ data: state.insertRows, error: state.updateError }) };
      },
    }),
  },
}));

import { CommissionEligibilityExceptionDialog } from "@/components/orders/CommissionEligibilityExceptionDialog";

const ALLOWLIST = [
  "order_id",
  "force_commission_eligible",
  "force_commission_reason",
  "force_commission_by",
  "force_commission_at",
];

const FORBIDDEN = [
  "team_commission_price",
  "team_commission_price_is_manual",
  "commission_price_confirmed_by",
  "commission_price_confirmed_at",
  "last_confirmed_commission_price",
  "last_confirmed_final_price",
  "scout_commission_rate",
  "closer_commission_rate",
  "closer_id",
  "video_creator_id",
  "traffic_source",
  "booking_method",
  "ad_id",
  "franchise_project",
  "member_number",
  "is_excluded",
  "exclusion_note",
  "inquiry_date",
  "voucher_count",
  "addon_note",
  "addon_amount",
  "nickname",
  "deposit_confirm_date",
  "display_currency",
];

const renderDialog = () =>
  render(
    <CommissionEligibilityExceptionDialog orderId="o1" open onClose={() => {}} />,
  );

beforeEach(() => {
  state.row = null;
  state.persisted = null;
  state.updateError = null;
  state.updateRows = [{ order_id: "o1" }];
  state.insertRows = [{ order_id: "o1" }];
  state.updatePayloads = [];
  state.insertPayloads = [];
  state.selects = [];
  state.reads = 0;
  toastError.mockClear();
  toastSuccess.mockClear();
});

describe("獎金資格例外 Dialog（/admin/orders/:id 專用）", () => {
  it("只顯示例外相關欄位，不顯示一般行銷資訊與人工分潤金額", async () => {
    renderDialog();
    expect(await screen.findByText("獎金資格例外")).toBeInTheDocument();
    expect(screen.getByText("計入成交組獎金（例外）")).toBeInTheDocument();
    expect(
      screen.getByText("僅調整此訂單是否納入成交組獎金計算，實際分潤金額仍由系統自動計算。"),
    ).toBeInTheDocument();
    for (const label of ["成交人", "來源管道", "訂房方式", "廣告編號", "分潤基準金額", "客戶暱稱"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it("只讀取 force 欄位（不 SELECT 分潤金額或行銷欄位）", async () => {
    renderDialog();
    await waitFor(() => expect(state.selects.length).toBeGreaterThan(0));
    const metaSelect = state.selects.find((s) => s.startsWith("order_meta:"))!;
    for (const f of FORBIDDEN) expect(metaSelect).not.toContain(f);
    for (const f of ["force_commission_eligible", "force_commission_reason", "force_commission_by", "force_commission_at"]) {
      expect(metaSelect).toContain(f);
    }
  });

  it("勾選但原因空白 → 不寫入且顯示錯誤", async () => {
    renderDialog();
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("請填寫例外原因"));
    expect(state.updatePayloads.length + state.insertPayloads.length).toBe(0);
  });

  it("啟用例外：payload 嚴格符合 allowlist，並帶入操作者與時間", async () => {
    state.row = {
      force_commission_eligible: false,
      force_commission_reason: null,
      force_commission_by: null,
      force_commission_at: null,
    };
    renderDialog();
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.change(screen.getByPlaceholderText("例外原因（必填，將寫入變更紀錄）"), {
      target: { value: "  KOL 自費  " },
    });
    state.persisted = {
      force_commission_eligible: true,
      force_commission_reason: "KOL 自費",
      force_commission_by: "super-1",
      force_commission_at: new Date().toISOString(),
    };
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(state.updatePayloads.length).toBe(1));
    const payload = state.updatePayloads[0];
    for (const k of Object.keys(payload)) expect(ALLOWLIST).toContain(k);
    expect(payload.force_commission_eligible).toBe(true);
    expect(payload.force_commission_reason).toBe("KOL 自費");
    expect(payload.force_commission_by).toBe("super-1");
    expect(typeof payload.force_commission_at).toBe("string");
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it("取消例外：reason / actor / timestamp 皆為 null", async () => {
    state.row = {
      force_commission_eligible: true,
      force_commission_reason: "舊原因",
      force_commission_by: "super-1",
      force_commission_at: "2026-01-01T00:00:00Z",
    };
    renderDialog();
    const cb = await screen.findByRole("checkbox");
    await waitFor(() => expect(cb.getAttribute("data-state")).toBe("checked"));
    fireEvent.click(cb);
    state.persisted = {
      force_commission_eligible: false,
      force_commission_reason: null,
      force_commission_by: null,
      force_commission_at: null,
    };
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(state.updatePayloads.length).toBe(1));
    expect(state.updatePayloads[0]).toEqual({
      force_commission_eligible: false,
      force_commission_reason: null,
      force_commission_by: null,
      force_commission_at: null,
    });
  });

  it("order_meta 不存在時以 allowlist INSERT（含 order_id）", async () => {
    state.row = null;
    renderDialog();
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.change(screen.getByPlaceholderText("例外原因（必填，將寫入變更紀錄）"), {
      target: { value: "自費" },
    });
    state.persisted = {
      force_commission_eligible: true,
      force_commission_reason: "自費",
      force_commission_by: "super-1",
      force_commission_at: new Date().toISOString(),
    };
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(state.insertPayloads.length).toBe(1));
    expect(Object.keys(state.insertPayloads[0]).sort()).toEqual([...ALLOWLIST].sort());
  });

  it("Supabase 錯誤 → 不顯示成功", async () => {
    state.row = { force_commission_eligible: false, force_commission_reason: null, force_commission_by: null, force_commission_at: null };
    state.updateError = { message: "42501" };
    renderDialog();
    await screen.findByRole("checkbox");
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("affected rows = 0 → 不顯示成功", async () => {
    state.row = { force_commission_eligible: false, force_commission_reason: null, force_commission_by: null, force_commission_at: null };
    state.updateRows = [];
    renderDialog();
    await screen.findByRole("checkbox");
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("persist verification 失敗 → 不顯示成功", async () => {
    state.row = { force_commission_eligible: false, force_commission_reason: null, force_commission_by: null, force_commission_at: null };
    renderDialog();
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.change(screen.getByPlaceholderText("例外原因（必填，將寫入變更紀錄）"), {
      target: { value: "自費" },
    });
    state.persisted = {
      force_commission_eligible: false,
      force_commission_reason: null,
      force_commission_by: null,
      force_commission_at: null,
    };
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe("既有 /admin 訂單頁入口收斂", () => {
  const src = readFileSync(resolve(__dirname, "../pages/OrderDetail.tsx"), "utf8");

  it("不再使用共用 OrderMetaDrawer", () => {
    expect(src).not.toContain("OrderMetaDrawer");
  });

  it("改用獎金資格例外 Dialog，且僅 Superadmin 可見／可 render", () => {
    expect(src).toContain("CommissionEligibilityExceptionDialog");
    expect(src).toContain("獎金資格例外");
    expect(src).not.toContain("行銷／獎金");
    const entries = src.split("setShowMetaDrawer(true)");
    expect(entries.length).toBe(3); // desktop + mobile
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1].slice(-400)).toContain("isSuperAdmin &&");
    }
  });
});
