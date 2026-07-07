import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  preCheckExistingSession,
  runOAuthExchange,
  decodeReturnUrlFromState,
  buildRedirectWithSessionHandoff,
} from "@/utils/oauthCallbackHandler";

const TAG = "LINE";
const LABEL = "LINE ";
const FALLBACK_REDIRECT_URI = "https://booking.lakeze.com/member/auth/line-callback";

const MemberLineCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("LINE 登入處理中…");
  const ranRef = useRef(false);

  useEffect(() => {
    console.log(`[${TAG} callback] effect run, ranRef=`, ranRef.current);
    if (ranRef.current) return;
    ranRef.current = true;

    const finish = async (path: string, tokens?: { access?: string; refresh?: string }) => {
      console.log(`[${TAG} callback] navigate →`, path);
      if (/^https?:\/\//i.test(path)) {
        const target = await buildRedirectWithSessionHandoff(TAG, path, tokens);
        window.location.replace(target);
      } else {
        navigate(path, { replace: true });
      }
    };

    (async () => {
      const state = searchParams.get("state");
      // LINE state format from payment page: <random>.<returnB64>.<nonce>
      const returnFromState = decodeReturnUrlFromState(state);
      const nonceFromState = state && state.split(".").length >= 3
        ? state.split(".")[2]
        : null;
      console.log(`[${TAG} callback] returnFromState=`, returnFromState, "nonceFromState=", !!nonceFromState);

      // 1. Pre-check: if a session already exists, skip everything.
      const existingRedirect = await preCheckExistingSession(TAG, returnFromState);
      if (existingRedirect) {
        sessionStorage.removeItem("line_oauth_state");
        sessionStorage.removeItem("line_oauth_nonce");
        sessionStorage.removeItem("line_oauth_redirect_uri");
        await finish(existingRedirect.redirectTo, {
          access: existingRedirect.accessToken,
          refresh: existingRedirect.refreshToken,
        });
        return;
      }

      const code = searchParams.get("code");
      const errorParam = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");

      // Read state/nonce/redirect_uri from localStorage (migrated from
      // sessionStorage so iOS new-tab callback can still validate).
      // Fallback to sessionStorage briefly for any in-flight logins started
      // before this deploy.
      const storedState =
        localStorage.getItem("line_oauth_state") ??
        sessionStorage.getItem("line_oauth_state");
      const storedNonce =
        localStorage.getItem("line_oauth_nonce") ??
        sessionStorage.getItem("line_oauth_nonce");
      const storedRedirect =
        localStorage.getItem("line_oauth_redirect_uri") ??
        sessionStorage.getItem("line_oauth_redirect_uri");

      const cleanup = () => {
        localStorage.removeItem("line_oauth_state");
        localStorage.removeItem("line_oauth_nonce");
        localStorage.removeItem("line_oauth_redirect_uri");
        localStorage.removeItem("line_oauth_ts");
        sessionStorage.removeItem("line_oauth_state");
        sessionStorage.removeItem("line_oauth_nonce");
        sessionStorage.removeItem("line_oauth_redirect_uri");
      };

      const fail = (msg: string) => {
        cleanup();
        toast.error(msg);
        setMessage(msg);
        setTimeout(() => navigate("/member/auth", { replace: true }), 1500);
      };

      if (errorParam) {
        fail(`LINE 登入失敗：${errorDescription || errorParam}`);
        return;
      }
      if (!code || !state) {
        fail("LINE 回呼參數不完整");
        return;
      }

      // State validation: same-origin → strict; cross-origin → state must
      // carry our embedded return URL marker.
      if (storedState) {
        if (state !== storedState) {
          fail("LINE 登入 state 驗證失敗，請重新嘗試");
          return;
        }
      } else if (!returnFromState) {
        fail("LINE 登入 state 驗證失敗，請重新嘗試");
        return;
      }

      const redirectUri = storedRedirect || FALLBACK_REDIRECT_URI;
      const expectedNonce = storedNonce || nonceFromState;
      if (!expectedNonce) {
        fail("LINE 登入資訊已遺失，請重新嘗試");
        return;
      }

      const result = await runOAuthExchange({
        tag: TAG,
        functionName: "line-oauth-exchange",
        invokeBody: {
          code,
          redirectUri,
          expectedNonce,
        },
        successLabel: LABEL,
        returnUrlOverride: returnFromState,
      });

      cleanup();
      if (result.ok) {
        if (result.successMessage) toast.success(result.successMessage);
        await finish(result.redirectTo, { access: result.accessToken, refresh: result.refreshToken });
      } else {
        fail(result.errorMessage || "LINE 登入失敗");
      }
    })();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-orange-50 to-white">
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin mx-auto" style={{ color: "hsl(24, 100%, 50%)" }} />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
};

export default MemberLineCallback;
