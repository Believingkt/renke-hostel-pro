import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@lakeze/shared/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@lakeze/shared/integrations/supabase/client", () => {
  const data: Record<string, any[]> = { accommodation_info: [{ id: "a1", name: "天送幸福和苑" }, { id: "a2", name: "四季山宿" }] };
  const from = (table: string) => {
    const q: any = new Proxy({}, {
      get: (_t, k) => k === "then"
        ? (ok: any) => Promise.resolve({ data: data[table] ?? [], error: null }).then(ok)
        : k === "maybeSingle" || k === "single" ? () => Promise.resolve({ data: null, error: null }) : () => q,
    });
    return q;
  };
  return { supabase: { from, rpc: () => Promise.resolve({ data: [], error: null }) } };
});

import { KolReciprocalQuotaTab } from "@/components/team/KolReciprocalQuotaTab";

describe("KOL 互惠額度：嵌入單館頁時館別固定", () => {
  it("lockedAccommodation＋只允許一館：不顯示「管理館別」下拉與範圍說明", async () => {
    render(<KolReciprocalQuotaTab isManager defaultAccommodationId="a1" allowedAccommodationIds={["a1"]} lockedAccommodation />);
    await waitFor(() => expect(screen.getByText("日曆檢視")).toBeTruthy());
    expect(screen.queryByText("管理館別")).toBeNull();
    expect(screen.queryByText("你可編輯的館別範圍")).toBeNull();
  });

  it("KOL 星探頁（未鎖定）維持原樣：顯示館別下拉", async () => {
    render(<KolReciprocalQuotaTab isManager defaultAccommodationId="a1" />);
    await waitFor(() => expect(screen.getByText("日曆檢視")).toBeTruthy());
    expect(screen.getByText("管理館別")).toBeTruthy();
  });
});
