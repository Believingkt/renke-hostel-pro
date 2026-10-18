import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

let currentRoles: string[] = [];
const session = { user: { id: "u1", user_metadata: {} } };

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() }, Toaster: () => null }));
vi.mock("@lakeze/shared/components/HQSidebar", () => ({ HQSidebar: () => null }));
vi.mock("@lakeze/shared/components/HQHeader", () => ({ HQHeader: () => null }));
vi.mock("@lakeze/shared/components/AppSidebar", () => ({ AppSidebar: () => null }));
vi.mock("@lakeze/shared/components/Header", () => ({ Header: () => null }));
vi.mock("@lakeze/shared/hooks/use-order-notifications", () => ({ useOrderNotifications: () => undefined }));
vi.mock("@lakeze/shared/hooks/use-session-keepalive", () => ({ useSessionKeepAlive: () => undefined }));
vi.mock("@lakeze/shared/components/ui/sidebar", () => ({ SidebarProvider: ({ children }: { children: unknown }) => children }));
vi.mock("@lakeze/shared/contexts/HQContext", () => ({ HQProvider: ({ children }: { children: unknown }) => children }));
vi.mock("@lakeze/shared/integrations/supabase/client", () => {
  const rolesResult = () => Promise.resolve({ data: currentRoles.map((role) => ({ role })), error: null });
  return {
    supabase: {
      auth: {
        getSession: () => Promise.resolve({ data: { session } }),
        getUser: () => Promise.resolve({ data: { user: session.user } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      },
      from: (table: string) => ({
        select: () => ({
          eq: () => {
            const p: any = table === "user_roles" ? rolesResult() : Promise.resolve({ data: null, error: null });
            p.maybeSingle = () => Promise.resolve({ data: { force_password_change: false }, error: null });
            p.limit = () => rolesResult();
            return p;
          },
        }),
      }),
    },
  };
});

import { ConditionalLayout } from "@lakeze/shared/components/ConditionalLayout";
import { RequireHQRole } from "@/components/hq/RequireHQRole";
import { HQ_FULL_ACCESS_ROLES, HQ_LOGIN_ROLES, HQ_SETTINGS_ROLES, HQ_SETTINGS_PATHS } from "@/lib/hqAccess";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ConditionalLayout hqRoles={HQ_LOGIN_ROLES} hqSettings={{ paths: HQ_SETTINGS_PATHS, roles: HQ_SETTINGS_ROLES }} />}>
          <Route path="/hq" element={<div>HQ 首頁</div>} />
          <Route path="/hq/bonus-settings" element={<RequireHQRole allow={HQ_SETTINGS_ROLES}><div>月結設定頁</div></RequireHQRole>} />
          <Route path="/hq/owner-settlement-settings" element={<RequireHQRole allow={HQ_SETTINGS_ROLES}><div>舊月結設定頁</div></RequireHQRole>} />
          <Route path="/hq/bonus-settings-x" element={<div>相似網址頁</div>} />
          <Route path="/hq/cdp" element={<div>一般 HQ 頁</div>} />
          {["line-butler", "kol-overview", "referral"].map((p) => (
            <Route key={p} path={`/hq/${p}`} element={<RequireHQRole allow={HQ_FULL_ACCESS_ROLES}><div>敏感頁 {p}</div></RequireHQRole>} />
          ))}
        </Route>
        <Route path="/hq-auth" element={<div>總部登入頁</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const CASES: [string, string[], string, string][] = [
  ["單館業主", ["hotel_admin", "owner"], "/hq/line-butler", "總部登入頁"],
  ["本館 staff", ["staff"], "/hq/referral", "總部登入頁"],
  ["hotel_admin 進月結設定頁（維持既有）", ["hotel_admin"], "/hq/bonus-settings", "月結設定頁"],
  ["hotel_admin 進舊月結設定網址", ["hotel_admin"], "/hq/owner-settlement-settings", "舊月結設定頁"],
  ["hotel_admin 從 PMS 帶館別參數進月結設定", ["hotel_admin"], "/hq/bonus-settings?tab=owner-settlement&acc=a", "月結設定頁"],
  ["hotel_admin 進 HQ 首頁", ["hotel_admin"], "/hq", "總部登入頁"],
  ["hotel_admin 進一般 HQ 頁", ["hotel_admin"], "/hq/cdp", "總部登入頁"],
  ["hotel_admin 進月結相似網址", ["hotel_admin"], "/hq/bonus-settings-x", "總部登入頁"],
  ["hotel_admin＋owner 進敏感頁", ["hotel_admin", "owner"], "/hq/kol-overview", "總部登入頁"],
  ["staff 進月結設定頁", ["staff"], "/hq/bonus-settings", "總部登入頁"],
  ["finance 進敏感頁", ["finance"], "/hq/kol-overview", "HQ 首頁"],
  ["am 進敏感頁", ["am"], "/hq/line-butler", "HQ 首頁"],
  ["finance 進月結設定頁（不變）", ["finance"], "/hq/bonus-settings", "月結設定頁"],
  ["am 進月結設定頁（不變）", ["am"], "/hq/bonus-settings", "月結設定頁"],
  ["全域 admin", ["admin"], "/hq/kol-overview", "敏感頁 kol-overview"],
  ["super_admin", ["super_admin"], "/hq/referral", "敏感頁 referral"],
];

describe("HQ 頁面門禁", () => {
  beforeEach(() => { currentRoles = []; });
  it.each(CASES)("%s", async (_label, roles, path, expected) => {
    currentRoles = roles;
    renderAt(path);
    await waitFor(() => expect(screen.getByText(expected)).toBeTruthy());
  });
});
