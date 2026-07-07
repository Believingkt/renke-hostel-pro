/**
 * Regression: iOS Safari opens LINE callback in a NEW tab (universal link
 * from LINE app). sessionStorage is per-tab and would be empty; with the
 * localStorage migration, state validation must still work — and both
 * success and failure paths must clean up localStorage.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, useNavigate: () => navigateMock };
});

const runOAuthExchangeMock = vi.fn();
const preCheckExistingSessionMock = vi.fn().mockResolvedValue(null);
vi.mock("@/utils/oauthCallbackHandler", () => ({
  preCheckExistingSession: (...a: unknown[]) => preCheckExistingSessionMock(...a),
  runOAuthExchange: (...a: unknown[]) => runOAuthExchangeMock(...a),
  decodeReturnUrlFromState: () => null,
  buildRedirectWithSessionHandoff: async (_tag: string, p: string) => p,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const LINE_KEYS = [
  "line_oauth_state",
  "line_oauth_nonce",
  "line_oauth_redirect_uri",
  "line_oauth_ts",
];

async function renderCallback(search: string) {
  const MemberLineCallback = (await import("./MemberLineCallback")).default;
  return render(
    <MemoryRouter initialEntries={[`/member/auth/line-callback${search}`]}>
      <Routes>
        <Route path="/member/auth/line-callback" element={<MemberLineCallback />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MemberLineCallback — iOS new-tab regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    Object.defineProperty(navigator, "userAgent", {
      value: IOS_UA,
      configurable: true,
    });
  });

  it("removes localStorage keys after successful state validation + exchange", async () => {
    const state = "state-abc-123";
    localStorage.setItem("line_oauth_state", state);
    localStorage.setItem("line_oauth_nonce", "nonce-xyz");
    localStorage.setItem("line_oauth_redirect_uri", "https://booking.lakeze.com/member/auth/line-callback");
    localStorage.setItem("line_oauth_ts", String(Date.now()));

    runOAuthExchangeMock.mockResolvedValue({
      ok: true,
      redirectTo: "/member/orders",
      successMessage: "LINE 登入成功",
      accessToken: "at",
      refreshToken: "rt",
    });

    await renderCallback(`?code=CODE&state=${state}`);

    await waitFor(() => expect(runOAuthExchangeMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      LINE_KEYS.forEach((k) => expect(localStorage.getItem(k)).toBeNull()),
    );
  });

  it("removes localStorage keys when state validation fails (iOS new-tab: no storedState)", async () => {
    // Simulate the exact bug: callback opened in a new Safari tab.
    // localStorage IS shared cross-tab, but in older builds only sessionStorage
    // was written. Here we assert that if state does not match / storage is
    // empty, cleanup still wipes any residual keys and the error UI shows.
    localStorage.setItem("line_oauth_state", "different-state");
    localStorage.setItem("line_oauth_nonce", "nonce-xyz");
    localStorage.setItem("line_oauth_redirect_uri", "https://booking.lakeze.com/member/auth/line-callback");
    localStorage.setItem("line_oauth_ts", String(Date.now()));

    await renderCallback(`?code=CODE&state=returned-state-does-not-match`);

    await waitFor(() =>
      expect(screen.getByText("LINE 登入失敗")).toBeInTheDocument(),
    );
    // Retry button visible
    expect(screen.getByText("回到登入頁重新嘗試")).toBeInTheDocument();
    // Cleanup ran
    LINE_KEYS.forEach((k) => expect(localStorage.getItem(k)).toBeNull());
    // No exchange attempted
    expect(runOAuthExchangeMock).not.toHaveBeenCalled();
  });

  it("removes localStorage keys when TTL expired (>10 min)", async () => {
    const state = "state-old";
    localStorage.setItem("line_oauth_state", state);
    localStorage.setItem("line_oauth_nonce", "nonce-old");
    localStorage.setItem("line_oauth_redirect_uri", "https://booking.lakeze.com/member/auth/line-callback");
    localStorage.setItem("line_oauth_ts", String(Date.now() - 11 * 60 * 1000));

    await renderCallback(`?code=CODE&state=${state}`);

    await waitFor(() =>
      expect(screen.getByText("LINE 登入失敗")).toBeInTheDocument(),
    );
    LINE_KEYS.forEach((k) => expect(localStorage.getItem(k)).toBeNull());
    expect(runOAuthExchangeMock).not.toHaveBeenCalled();
  });
});
