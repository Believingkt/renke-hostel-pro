import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RequireHQRole } from "@/components/hq/RequireHQRole";
import { HQ_AI_ROLES } from "@/lib/hqAccess";

const rolesRef: { value: string[] } = { value: [] };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: "u1" } } }),
    },
    from: () => ({
      select: () => ({
        eq: async () => ({ data: rolesRef.value.map((role) => ({ role })) }),
      }),
    }),
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/hq/ai-training/prompt"]}>
      <Routes>
        <Route
          path="/hq/ai-training/prompt"
          element={
            <RequireHQRole allow={HQ_AI_ROLES}>
              <div>AI_PAGE</div>
            </RequireHQRole>
          }
        />
        <Route path="/hq" element={<div>HQ_HOME</div>} />
        <Route path="/hq-auth" element={<div>HQ_AUTH</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("/hq/ai-training 路由守衛", () => {
  beforeEach(() => {
    rolesRef.value = [];
  });

  it("super_admin 可正常進入", async () => {
    rolesRef.value = ["super_admin"];
    renderGuard();
    await waitFor(() => expect(screen.getByText("AI_PAGE")).toBeTruthy());
  });

  it("admin 可正常進入", async () => {
    rolesRef.value = ["admin"];
    renderGuard();
    await waitFor(() => expect(screen.getByText("AI_PAGE")).toBeTruthy());
  });

  it("hotel_admin 直達網址會被導回 /hq", async () => {
    rolesRef.value = ["hotel_admin"];
    renderGuard();
    await waitFor(() => expect(screen.getByText("HQ_HOME")).toBeTruthy());
    expect(screen.queryByText("AI_PAGE")).toBeNull();
  });

  it("staff 直達網址會被導回 /hq", async () => {
    rolesRef.value = ["staff"];
    renderGuard();
    await waitFor(() => expect(screen.getByText("HQ_HOME")).toBeTruthy());
    expect(screen.queryByText("AI_PAGE")).toBeNull();
  });
});
