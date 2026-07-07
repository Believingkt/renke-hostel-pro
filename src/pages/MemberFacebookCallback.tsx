import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  preCheckExistingSession,
  runOAuthExchange,
  decodeReturnUrlFromState,
  buildRedirectWithSessionHandoff,
} from "@/utils/oauthCallbackHandler";

const TAG = "FB";
const LABEL = "Facebook ";
const FALLBACK_REDIRECT_URI = "https://booking.lakeze.com/member/auth/facebook-callback";

const MemberFacebookCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("Facebook 登入處理中…");
  const [failure, setFailure] = useState<{ msg: string; debug?: unknown } | null>(null);
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
      // Cross-origin return URL recovery (sessionStorage is per-origin and
      // the payment page may live on a different domain).
      const returnFromState = decodeReturnUrlFromState(state);
      console.log(`[${TAG} callback] returnFromState=`, returnFromState);

      // 1. Pre-check: if a session already exists, skip everything.
      const existingRedirect = await preCheckExistingSession(TAG, returnFromState);
      if (existingRedirect) {
        localStorage.removeItem("fb_oauth_state");
        localStorage.removeItem("fb_oauth_redirect_uri");
        localStorage.removeItem("fb_oauth_ts");
        sessionStorage.removeItem("fb_oauth_state");
        sessionStorage.removeItem("fb_oauth_redirect_uri");
        await finish(existingRedirect.redirectTo, {
          access: existingRedirect.accessToken,
          refresh: existingRedirect.refreshToken,
        });
        return;
      }

      const code = searchParams.get("code");
      const errorParam = searchParams.get("error");
      const errorReason =
        searchParams.get("error_reason") || searchParams.get("error_description");

      // Read from localStorage (fallback sessionStorage for in-flight logins).
      const storedState =
        localStorage.getItem("fb_oauth_state") ??
        sessionStorage.getItem("fb_oauth_state");
      const storedRedirect =
        localStorage.getItem("fb_oauth_redirect_uri") ??
        sessionStorage.getItem("fb_oauth_redirect_uri");
      const storedTs = Number(localStorage.getItem("fb_oauth_ts") || 0);
      const TTL_MS = 10 * 60 * 1000;
      const expired = storedTs > 0 && Date.now() - storedTs > TTL_MS;

      const cleanup = () => {
        localStorage.removeItem("fb_oauth_state");
        localStorage.removeItem("fb_oauth_redirect_uri");
        localStorage.removeItem("fb_oauth_ts");
        sessionStorage.removeItem("fb_oauth_state");
        sessionStorage.removeItem("fb_oauth_redirect_uri");
      };

      const fail = (msg: string, debug?: unknown) => {
        cleanup();
        toast.error(msg);
        setMessage(msg);
        setFailure({ msg, debug });
      };

      if (errorParam) {
        fail(`Facebook 登入失敗：${errorReason || errorParam}`);
        return;
      }
      if (!code || !state) {
        fail("Facebook 回呼參數不完整");
        return;
      }

      // State validation:
      // - Same-origin: stored state must match.
      // - Cross-origin (no stored state): state must carry our embedded
      //   return URL marker (decodeReturnUrlFromState succeeded), which proves
      //   it was minted by our payment page in this browser flow.
      const stateDebug = {
        hasStoredState: !!storedState,
        hasReturnFromState: !!returnFromState,
        hasStoredTs: storedTs > 0,
        ageSec: storedTs > 0 ? Math.round((Date.now() - storedTs) / 1000) : null,
        stateLen: state?.length ?? 0,
        storedStateLen: storedState?.length ?? 0,
        stateMatches: !!storedState && state === storedState,
        ua: navigator.userAgent.substring(0, 120),
      };
      if (storedState) {
        if (state !== storedState) {
          console.warn(`[${TAG} callback] state mismatch`, stateDebug);
          fail("Facebook 登入驗證失敗，可能因為分頁被切換。請回到登入頁重新登入。");
          return;
        }
      } else if (!returnFromState) {
        console.warn(`[${TAG} callback] state missing (no storedState, no embedded return)`, stateDebug);
        fail("Facebook 登入資訊遺失，請回到登入頁重新登入。");
        return;
      }
      if (expired) {
        fail("Facebook 登入已逾時，請重新登入");
        return;
      }

      const redirectUri = storedRedirect || FALLBACK_REDIRECT_URI;

      const result = await runOAuthExchange({
        tag: TAG,
        functionName: "facebook-oauth-exchange",
        invokeBody: { code, redirectUri },
        successLabel: LABEL,
        returnUrlOverride: returnFromState,
      });

      cleanup();
      if (result.ok) {
        if (result.successMessage) toast.success(result.successMessage);
        await finish(result.redirectTo, { access: result.accessToken, refresh: result.refreshToken });
      } else {
        fail(result.errorMessage || "Facebook 登入失敗");
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

export default MemberFacebookCallback;
