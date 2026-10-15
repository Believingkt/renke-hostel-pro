import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";

const h = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string } },
  authCb: null as null | ((event: string, session: unknown) => void),
  invoke: vi.fn(),
  native: false,
}));

vi.mock("@lakeze/shared/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: h.session } }),
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        h.authCb = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
    functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { name: table === "profiles" ? "員工甲" : "會員乙" } }) }) }),
    }),
  },
}));
vi.mock("@lakeze/shared/contexts/AccommodationContext", () => ({
  useAccommodation: () => ({ currentAccommodationId: "acc-1" }),
}));
vi.mock("@lakeze/shared/lib/appMode", () => ({ isNativeApp: () => h.native }));

import { IntercomMessenger } from "@lakeze/shared/components/IntercomMessenger";
import { buildIntercomSettings, classifyIntercomRoute, clearIntercomHashCache } from "@lakeze/shared/lib/intercom";

const HASH = "a".repeat(64);
let nav: ReturnType<typeof useNavigate> | null = null;
function NavGrab() { nav = useNavigate(); return null; }
const mount = (path: string) =>
  render(<MemoryRouter initialEntries={[path]}><NavGrab /><IntercomMessenger /></MemoryRouter>);

const scripts = () => Array.from(document.querySelectorAll("script")).filter((s) => s.src.includes("intercom.io"));
const calls = () => ((window.Intercom as any)?.q ?? []) as unknown[][];
const cmds = () => calls().map((c) => c[0]);

beforeEach(() => {
  h.session = null; h.authCb = null; h.native = false; nav = null;
  h.invoke.mockReset().mockImplementation(() => Promise.resolve({ data: { user_id: h.session?.user.id, user_hash: HASH }, error: null }));
  clearIntercomHashCache();
  delete (window as any).Intercom; delete (window as any).intercomSettings;
  document.querySelectorAll("script").forEach((s) => s.remove());
});
afterEach(() => vi.unstubAllEnvs());

describe("IntercomMessenger", () => {
  it("未設 VITE_INTERCOM_APP_ID → 不插 script、不建 window.Intercom、不呼叫 user-hash", async () => {
    vi.stubEnv("VITE_INTERCOM_APP_ID", "");
    h.session = { user: { id: "u1", email: "a@x.tw" } };
    const r = mount("/admin");
    await new Promise((res) => setTimeout(res, 20));
    expect(r.container.innerHTML).toBe("");
    expect(scripts()).toHaveLength(0);
    expect(window.Intercom).toBeUndefined();
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it("假 app_id + 前台未登入 → 載入 widget、匿名 boot（無 user_id）、不呼叫 user-hash；左下", async () => {
    vi.stubEnv("VITE_INTERCOM_APP_ID", "abc123");
    mount("/booking");
    await waitFor(() => expect(cmds()).toContain("boot"));
    expect(scripts().map((s) => s.src)).toEqual(["https://widget.intercom.io/widget/abc123"]);
    expect(window.intercomSettings).toMatchObject({ app_id: "abc123", language_override: "zh-TW", api_base: "https://api-iam.intercom.io", alignment: "left" });
    expect(window.intercomSettings).not.toHaveProperty("user_id");
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it("PMS 後台登入 → owner 身分帶 user_hash／accommodation_id；登出 shutdown 後匿名重 boot；路由切換 update", async () => {
    vi.stubEnv("VITE_INTERCOM_APP_ID", "abc123");
    h.session = { user: { id: "staff-1", email: "s@x.tw" } };
    mount("/sensaninn/admin/orders");
    await waitFor(() => expect(cmds()).toContain("boot"));
    expect(window.intercomSettings).toMatchObject({ user_id: "staff-1", user_hash: HASH, email: "s@x.tw", name: "員工甲", role: "owner", accommodation_id: "acc-1" });
    expect(h.invoke).toHaveBeenCalledWith("intercom-user-hash", { method: "POST" });

    act(() => nav!("/sensaninn/admin/rooms"));
    await waitFor(() => expect(cmds()).toContain("update"));

    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    h.session = null;
    act(() => h.authCb!("SIGNED_OUT", null));
    await waitFor(() => expect(cmds().filter((c) => c === "boot")).toHaveLength(2));
    expect(cmds()).toContain("shutdown");
    expect(log).toHaveBeenCalledWith("[Intercom] shutdown");
    expect(window.intercomSettings).not.toHaveProperty("user_id");

    h.session = { user: { id: "staff-2", email: "t@x.tw" } };
    act(() => h.authCb!("SIGNED_IN", h.session));
    await waitFor(() => expect((window.intercomSettings as any)?.user_id).toBe("staff-2"));
    expect(cmds().filter((c) => c === "boot")).toHaveLength(3);
    log.mockRestore();
  });

  it("同一 user 重新 boot（前台↔後台切換）不重打 user-hash；前台以會員身分 role guest", async () => {
    vi.stubEnv("VITE_INTERCOM_APP_ID", "abc123");
    h.session = { user: { id: "u9", email: "g@x.tw" } };
    mount("/booking");
    await waitFor(() => expect((window.intercomSettings as any)?.role).toBe("guest"));
    expect(window.intercomSettings).toMatchObject({ user_id: "u9", name: "會員乙" });
    expect(window.intercomSettings).not.toHaveProperty("accommodation_id");
    act(() => nav!("/hq"));
    await waitFor(() => expect((window.intercomSettings as any)?.role).toBe("hq"));
    expect(cmds()).toContain("shutdown");
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it("user-hash 失敗 → 以匿名 boot（不送未驗證的 user_id）", async () => {
    vi.stubEnv("VITE_INTERCOM_APP_ID", "abc123");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    h.invoke.mockImplementation(() => Promise.resolve({ data: null, error: new Error("401") }));
    h.session = { user: { id: "u1", email: "a@x.tw" } };
    mount("/admin");
    await waitFor(() => expect(cmds()).toContain("boot"));
    expect(window.intercomSettings).not.toHaveProperty("user_id");
  });
});

describe("intercom 純函式", () => {
  it("classifyIntercomRoute", () => {
    expect(classifyIntercomRoute("/admin")).toBe("owner");
    expect(classifyIntercomRoute("/admin/orders")).toBe("owner");
    expect(classifyIntercomRoute("/sensaninn/admin")).toBe("owner");
    expect(classifyIntercomRoute("/hq")).toBe("hq");
    expect(classifyIntercomRoute("/hq/cdp")).toBe("hq");
    expect(classifyIntercomRoute("/headquarters/change-password")).toBe("hq");
    expect(classifyIntercomRoute("/team/orders")).toBe("hq");
    expect(classifyIntercomRoute("/booking")).toBe("guest");
    expect(classifyIntercomRoute("/sensaninn")).toBe("guest");
    expect(classifyIntercomRoute("/member/messages")).toBe("guest");
    expect(classifyIntercomRoute("/")).toBe("guest");
  });

  it("App 模式隱藏浮動啟動器、不設 alignment", () => {
    const s = buildIntercomSettings({ appId: "x", native: true, role: "guest", identity: null });
    expect(s).toMatchObject({ hide_default_launcher: true });
    expect(s).not.toHaveProperty("alignment");
  });
});
