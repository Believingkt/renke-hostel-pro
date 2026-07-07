/**
 * Regression: iOS Safari opens Facebook callback in a NEW tab (universal
 * link from Facebook app). Validates that both success and failure paths
 * clean up localStorage and that failure surfaces the retry UI.
 *
 * Note: Facebook OAuth 2.0 does not use `nonce` (that's OIDC / LINE only).
 * We assert cleanup of the FB-specific keys.
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

const FB_KEYS = [
  "fb_oauth_state",
  "fb_oauth_redirect_uri",
  "fb_oauth_ts",
];

async function renderCallback(search: string) {
  const MemberFacebookCallback = (await import("./MemberFacebookCallback")).default;
  return render(
    <MemoryRouter initialEntries={[`/member/auth/facebook-callback${search}`]}>
      <Routes>
        <Route path="/member/auth/facebook-callback" element={<MemberFacebookCallback />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MemberFacebookCallback — iOS new-tab regression", () => {
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
    const state = "fb-state-abc-123";
    localStorage.setItem("fb_oauth_state", state);
    localStorage.setItem("fb_oauth_redirect_uri", "https://booking.lakeze.com/member/auth/facebook-callback");
    localStorage.setItem("fb_oauth_ts", String(Date.now()));

    runOAuthExchangeMock.mockResolvedValue({
      ok: true,
      redirectTo: "/member/orders",
      successMessage: "Facebook 登入成功",
      accessToken: "at",
      refreshToken: "rt",
    });

    await renderCallback(`?code=CODE&state=${state}`);

    await waitFor(() => expect(runOAuthExchangeMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      FB_KEYS.forEach((k) => expect(localStorage.getItem(k)).toBeNull()),
    );
  });

  it("removes localStorage keys and shows retry UI when state validation fails", async () => {
    localStorage.setItem("fb_oauth_state", "different-state");
    localStorage.setItem("fb_oauth_redirect_uri", "https://booking.lakeze.com/member/auth/facebook-callback");
    localStorage.setItem("fb_oauth_ts", String(Date.now()));

    await renderCallback(`?code=CODE&state=returned-state-does-not-match`);

    await waitFor(() =>
      expect(screen.getByText("Facebook 登入失敗")).toBeInTheDocument(),
    );
    expect(screen.getByText("回到登入頁重新嘗試")).toBeInTheDocument();
    FB_KEYS.forEach((k) => expect(localStorage.getItem(k)).toBeNull());
    expect(runOAuthExchangeMock).not.toHaveBeenCalled();
  });

  it("removes localStorage keys and shows retry UI when TTL expired (>10 min)", async () => {
    const state = "fb-state-old";
    localStorage.setItem("fb_oauth_state", state);
    localStorage.setItem("fb_oauth_redirect_uri", "https://booking.lakeze.com/member/auth/facebook-callback");
    localStorage.setItem("fb_oauth_ts", String(Date.now() - 11 * 60 * 1000));

    await renderCallback(`?code=CODE&state=${state}`);

    await waitFor(() =>
      expect(screen.getByText("Facebook 登入失敗")).toBeInTheDocument(),
    );
    FB_KEYS.forEach((k) => expect(localStorage.getItem(k)).toBeNull());
    expect(runOAuthExchangeMock).not.toHaveBeenCalled();
  });
});
