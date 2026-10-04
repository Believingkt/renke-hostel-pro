import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

/**
 * Phase 2E.1：review_source 切換的 affected-row verification。
 * 0-row / DB error 必須 fail-closed，不得出現成功 toast。
 */

const state = {
  platformReady: true,
  row: null as Record<string, unknown> | null,
  canEdit: true,
  upsertRows: [] as Array<Record<string, unknown>>,
  upsertError: null as { message: string } | null,
  lastUpsertPayload: null as Record<string, unknown> | null,
  lastConflict: null as unknown,
};

vi.mock("@lakeze/shared/hooks/use-staff-permissions", () => ({
  useStaffPermissions: () => ({
    canEdit: () => state.canEdit,
    canView: () => true,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), loading: vi.fn() },
}));

vi.mock("@lakeze/shared/integrations/supabase/client", () => ({
  supabase: {
    rpc: async () => ({ data: state.platformReady, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: state.row, error: null }) }),
      }),
      upsert: (payload: Record<string, unknown>, opts: unknown) => {
        state.lastUpsertPayload = payload;
        state.lastConflict = opts;
        return {
          select: async () => ({
            data: state.upsertError ? null : state.upsertRows,
            error: state.upsertError,
          }),
        };
      },
    }),
    functions: { invoke: async () => ({ data: {}, error: null }) },
  },
}));

import { GoogleBusinessProfileSettings } from "@/components/website-content/GoogleBusinessProfileSettings";
import { toast } from "sonner";

const connectedRow = (source: "PLACES" | "BUSINESS_PROFILE") => ({
  connection_status: "CONNECTED",
  oauth_connected_at: "2026-08-01T00:00:00Z",
  selected_account_name: "accounts/1",
  selected_location_name: "locations/9",
  selected_location_title: "森山民宿",
  sync_target: "50",
  review_source: source,
  last_business_profile_sync_at: null,
  candidate_review_count: 30,
});

const setup = () => render(<GoogleBusinessProfileSettings accommodationId="acc-1" />);

const clickSource = async (label: RegExp) => {
  const el = await screen.findByLabelText(label);
  fireEvent.click(el);
  return el as HTMLElement;
};

describe("GBP review_source toggle affected-row verification", () => {
  beforeEach(() => {
    state.platformReady = true;
    state.row = connectedRow("PLACES");
    state.canEdit = true;
    state.upsertRows = [{ accommodation_id: "acc-1" }];
    state.upsertError = null;
    state.lastUpsertPayload = null;
    state.lastConflict = null;
    vi.clearAllMocks();
  });

  it("PLACES → BUSINESS_PROFILE：1 row 回傳 → 成功", async () => {
    setup();
    await clickSource(/Google Business Profile$/);
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(state.lastUpsertPayload).toMatchObject({
      accommodation_id: "acc-1",
      review_source: "BUSINESS_PROFILE",
    });
    expect(state.lastConflict).toMatchObject({ onConflict: "accommodation_id" });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("BUSINESS_PROFILE → PLACES：1 row 回傳 → 成功", async () => {
    state.row = connectedRow("BUSINESS_PROFILE");
    setup();
    await clickSource(/Google Places/);
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(state.lastUpsertPayload).toMatchObject({ review_source: "PLACES" });
  });

  it("0-row → fail closed，不顯示成功 toast", async () => {
    state.upsertRows = [];
    setup();
    await clickSource(/Google Business Profile$/);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("DB error → fail closed，不顯示成功 toast", async () => {
    state.upsertError = { message: "permission denied" };
    setup();
    await clickSource(/Google Business Profile$/);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("跨館 row 回傳（accommodation_id 不符）→ 視為失敗", async () => {
    state.upsertRows = [{ accommodation_id: "acc-other" }];
    setup();
    await clickSource(/Google Business Profile$/);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("readonly 權限：來源選項 disabled 且不會寫入", async () => {
    state.canEdit = false;
    setup();
    const el = await screen.findByLabelText(/Google Business Profile$/);
    expect((el as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(el);
    expect(state.lastUpsertPayload).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("未連線時無法切換到 BUSINESS_PROFILE（不顯示同步設定）", async () => {
    state.row = null;
    setup();
    await waitFor(() => expect(screen.getByText("未連線")).toBeTruthy());
    expect(screen.queryByLabelText(/Google Business Profile$/)).toBeNull();
    expect(state.lastUpsertPayload).toBeNull();
  });
});
