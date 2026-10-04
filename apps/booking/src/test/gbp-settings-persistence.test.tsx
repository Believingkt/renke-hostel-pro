import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * Google Business Profile 自助連線 UI 契約測試。
 * 只驗證 UI ↔ Edge Function / DB 讀寫契約，不真的呼叫 Google。
 */

const state = {
  platformReady: true,
  row: null as Record<string, unknown> | null,
  canEdit: true,
  isStrictAdmin: true,

  invocations: [] as { name: string; body: unknown }[],
  invokeResult: {} as Record<string, { data?: unknown; error?: { message: string } }>,
  lastUpsertPayload: null as Record<string, unknown> | null,
};

vi.mock("@lakeze/shared/hooks/use-staff-permissions", () => ({
  useStaffPermissions: () => ({
    canEdit: () => state.canEdit,
    canView: () => true,
    isStrictAdmin: state.isStrictAdmin,
  }),
}));


vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@lakeze/shared/integrations/supabase/client", () => ({
  supabase: {
    rpc: async () => ({ data: state.platformReady, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.row, error: null }) }),
      }),
      upsert: (payload: Record<string, unknown>) => {
        state.lastUpsertPayload = payload;
        return {
          select: async () => ({
            data: [{ accommodation_id: (payload as { accommodation_id?: string }).accommodation_id }],
            error: null,
          }),
        };
      },
    }),
    functions: {
      invoke: async (name: string, opts: { body: unknown }) => {
        state.invocations.push({ name, body: opts.body });
        return state.invokeResult[name] ?? { data: {}, error: null };
      },
    },
  },
}));

import { GoogleBusinessProfileSettings } from "@/components/website-content/GoogleBusinessProfileSettings";
import { toast } from "sonner";

const CONNECTED_ROW = {
  connection_status: "CONNECTED",
  oauth_connected_at: "2026-09-01T00:00:00Z",
  selected_account_name: "accounts/1",
  selected_location_name: "locations/9",
  selected_location_title: "森山民宿",
  sync_target: "50",
  review_source: "BUSINESS_PROFILE",
  last_business_profile_sync_at: "2026-09-02T00:00:00Z",
  candidate_review_count: 37,
};

const setup = () => render(<GoogleBusinessProfileSettings accommodationId="acc-1" />);

describe("GoogleBusinessProfileSettings self-service", () => {
  beforeEach(() => {
    state.platformReady = true;
    state.row = null;
    state.canEdit = true;
    state.isStrictAdmin = true;
    state.invocations = [];
    state.invokeResult = {};
    state.lastUpsertPayload = null;
    vi.clearAllMocks();
  });

  it("未連線時顯示連結按鈕，且不呼叫任何 Google API", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("未連線")).toBeTruthy());
    expect(screen.getByRole("button", { name: /連結 Google 商家帳號/ })).toBeTruthy();
    expect(state.invocations).toHaveLength(0);
  });

  it("P5：本館憑證未齊，連線按鈕停用且列出缺少項目", async () => {
    setup();
    await waitFor(() => expect(screen.getByText(/尚未可進行 Google 授權/)).toBeTruthy());
    const btn = screen.getByRole("button", { name: /連結 Google 商家帳號/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(state.invocations).toHaveLength(0);
  });

  it("館主管理者可看到並儲存本館 Google Cloud 憑證（Project Number 保持文字）", async () => {
    setup();
    await waitFor(() => expect(screen.getByLabelText("Google Cloud Project ID")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Google Cloud Project ID"), {
      target: { value: " my-proj " },
    });
    fireEvent.change(screen.getByLabelText("Google Cloud Project Number"), {
      target: { value: "0123456789012" },
    });
    fireEvent.change(screen.getByLabelText("OAuth Client ID"), { target: { value: "cid.apps" } });
    fireEvent.click(screen.getByRole("button", { name: /儲存本館設定/ }));
    await waitFor(() => expect(state.lastUpsertPayload).toBeTruthy());
    expect(state.lastUpsertPayload).toMatchObject({
      accommodation_id: "acc-1",
      project_id: "my-proj",
      project_number: "0123456789012",
      oauth_client_id: "cid.apps",
    });
    // 絕不可送出 client_secret 相關欄位（僅後端可寫）
    expect(Object.keys(state.lastUpsertPayload!)).not.toContain("client_secret_configured");
    expect(JSON.stringify(state.lastUpsertPayload).toLowerCase()).not.toContain("secret");
  });

  it("非館主管理者看不到憑證欄位", async () => {
    state.isStrictAdmin = false;
    setup();
    await waitFor(() => expect(screen.getByText("未連線")).toBeTruthy());
    expect(screen.queryByLabelText("Google Cloud Project ID")).toBeNull();
    expect(screen.queryByLabelText("OAuth Client ID")).toBeNull();
    expect(screen.getByText(/僅限館主管理者設定/)).toBeTruthy();
  });


  it("已連線時顯示商家、候選數並提供同步 / 重新授權 / 解除連線", async () => {
    state.row = CONNECTED_ROW;
    setup();
    await waitFor(() => expect(screen.getByText("已連線")).toBeTruthy());
    expect(screen.getByText(/森山民宿/)).toBeTruthy();
    expect(screen.getByText(/候選評論 37 則/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /同步評論/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /重新授權/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /解除連線/ })).toBeTruthy();
  });

  it("同步評論會呼叫 Business Profile 同步函式", async () => {
    state.row = CONNECTED_ROW;
    state.invokeResult["fetch-google-business-profile-reviews"] = {
      data: { synced: 42, candidateCount: 42 },
      error: null,
    };
    setup();
    await waitFor(() => screen.getByRole("button", { name: /同步評論/ }));
    fireEvent.click(screen.getByRole("button", { name: /同步評論/ }));
    await waitFor(() =>
      expect(state.invocations[0]?.name).toBe("fetch-google-business-profile-reviews"),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("readonly 權限時所有操作皆 disabled", async () => {
    state.row = CONNECTED_ROW;
    state.canEdit = false;
    setup();
    await waitFor(() => expect(screen.getByText("已連線")).toBeTruthy());
    for (const name of [/同步評論/, /重新授權/, /解除連線/]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.getByText(/唯讀權限僅能查看連線狀態/)).toBeTruthy();
  });
});
