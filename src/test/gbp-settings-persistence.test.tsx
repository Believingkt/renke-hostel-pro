import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * PHASE 1B：Google Business Profile 設定 persistence 測試。
 * 僅測 UI ↔ DB 讀寫契約，不涉及 OAuth / Google API。
 */

const state = {
  row: null as Record<string, unknown> | null,
  selectError: null as { message: string } | null,
  upsertResult: { data: [{ accommodation_id: "acc-1" }], error: null } as {
    data: { accommodation_id: string }[] | null;
    error: { message: string } | null;
  },
  canEdit: true,
  lastUpsertPayload: null as Record<string, unknown> | null,
};

vi.mock("@/hooks/use-staff-permissions", () => ({
  useStaffPermissions: () => ({ canEdit: () => state.canEdit }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.row, error: state.selectError }),
        }),
      }),
      upsert: (payload: Record<string, unknown>) => {
        state.lastUpsertPayload = payload;
        return { select: async () => state.upsertResult };
      },
    }),
  },
}));

import { GoogleBusinessProfileSettings } from "@/components/website-content/GoogleBusinessProfileSettings";
import { toast } from "sonner";

const setup = () => render(<GoogleBusinessProfileSettings accommodationId="acc-1" />);

describe("GoogleBusinessProfileSettings persistence", () => {
  beforeEach(() => {
    state.row = null;
    state.selectError = null;
    state.upsertResult = { data: [{ accommodation_id: "acc-1" }], error: null };
    state.canEdit = true;
    state.lastUpsertPayload = null;
    vi.clearAllMocks();
  });

  it("無資料列時顯示空白初始狀態，不報錯", async () => {
    setup();
    await waitFor(() => {
      expect(
        (screen.getByLabelText("Google Cloud Project ID") as HTMLInputElement).value
      ).toBe("");
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByText("未設定")).toBeTruthy();
  });

  it("載入既有設定與 checklist", async () => {
    state.row = {
      project_id: "proj-x",
      project_number: "123456789012",
      oauth_client_id: "client-x",
      account_id: "accounts/1",
      location_id: "locations/2",
      connection_status: "APPLICATION_PENDING",
      application_status: "PENDING",
      checklist: { "已取得 Project Number": true },
    };
    setup();
    await waitFor(() => {
      expect(
        (screen.getByLabelText("Google Cloud Project ID") as HTMLInputElement).value
      ).toBe("proj-x");
    });
    expect(
      (screen.getByLabelText("Google Cloud Project Number") as HTMLInputElement).value
    ).toBe("123456789012");
    expect(screen.getByText("申請審核中")).toBeTruthy();
  });

  it("project_number 空值時儲存為 null", async () => {
    setup();
    await waitFor(() => screen.getByText("儲存設定"));
    fireEvent.click(screen.getByText("儲存設定"));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(state.lastUpsertPayload!.project_number).toBeNull();
  });

  it("儲存成功且 payload 不含任何 secret / token", async () => {
    setup();
    await waitFor(() => screen.getByText("儲存設定"));
    fireEvent.change(screen.getByLabelText("Google Cloud Project ID"), {
      target: { value: "proj-1" },
    });
    fireEvent.change(screen.getByLabelText("Google Cloud Project Number"), {
      target: { value: "  123456789012  " },
    });
    fireEvent.click(screen.getByText("儲存設定"));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const payload = state.lastUpsertPayload!;
    expect(payload.project_id).toBe("proj-1");
    expect(payload.project_number).toBe("123456789012");
    expect(Object.keys(payload).join(",")).not.toMatch(/secret|token/i);
  });

  it("儲存錯誤視為失敗", async () => {
    state.upsertResult = { data: null, error: { message: "boom" } };
    setup();
    await waitFor(() => screen.getByText("儲存設定"));
    fireEvent.click(screen.getByText("儲存設定"));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("0 row（RLS 擋下）視為失敗", async () => {
    state.upsertResult = { data: [], error: null };
    setup();
    await waitFor(() => screen.getByText("儲存設定"));
    fireEvent.click(screen.getByText("儲存設定"));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("readonly 權限時欄位與儲存皆 disabled", async () => {
    state.canEdit = false;
    setup();
    await waitFor(() => screen.getByText("儲存設定"));
    expect(
      (screen.getByLabelText("Google Cloud Project ID") as HTMLInputElement).disabled
    ).toBe(true);
    expect(
      (screen.getByLabelText("Google Cloud Project Number") as HTMLInputElement).disabled
    ).toBe(true);
    expect((screen.getByText("儲存設定") as HTMLButtonElement).disabled).toBe(true);
  });
});
