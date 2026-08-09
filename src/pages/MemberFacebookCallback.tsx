import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  preCheckExistingSession,
  runOAuthExchange,
  decodeReturnUrlFromState,
  isExternalReturnUrl,
  isNativeReturnUrl,
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
      if (isExternalReturnUrl(path)) {
        console.log(`[${TAG} callback] handoff token keys:`, {
          access_token: !!tokens?.access,
          refresh_token: !!tokens?.refresh,
        });
        const target = await buildRedirectWithSessionHandoff(TAG, path, tokens);
        // Temporary field diagnostic: leave enough time for the values to be
        // visible before the custom-scheme deep link returns to the native app.
        if (isNativeReturnUrl(path)) {
          await new Promise((resolve) => window.setTimeout(resolve, 600));
        }
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
      const nativeFlow = isNativeReturnUrl(returnFromState);
      console.log(`[${TAG} callback] detected native mode:`, nativeFlow);

      // Native callbacks run in an isolated browser. A session found there can
      // contain a refresh token that was already consumed and is not proof that
      // the app WebView is signed in. Native FB must always exchange the fresh
      // authorization code and hand those fresh tokens to the app.
      const existingRedirect = nativeFlow
        ? null
        : await preCheckExistingSession(TAG, returnFromState);
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
      if (nativeFlow) {
        console.log(`[${TAG} callback] native flow — validating from state only`);
      } else if (storedState) {
        if (state !== storedState) {
          console.warn(`[${TAG} callback] state mismatch`, stateDebug);
          fail("Facebook 登入驗證失敗，可能因為分頁被切換。請回到登入頁重新登入。", stateDebug);
          return;
        }
      } else if (!returnFromState) {
        console.warn(`[${TAG} callback] state missing (no storedState, no embedded return)`, stateDebug);
        fail("Facebook 登入資訊遺失，請回到登入頁重新登入。", stateDebug);
        return;
      }
      if (!nativeFlow && expired) {
        fail("Facebook 登入已逾時，請重新登入");
        return;
      }

      // Must be character-identical to the authorize redirect_uri. Native runs
      // never have storedRedirect, so always use the canonical constant.
      const redirectUri = nativeFlow ? FALLBACK_REDIRECT_URI : (storedRedirect || FALLBACK_REDIRECT_URI);

      const result = await runOAuthExchange({
        tag: TAG,
        functionName: "facebook-oauth-exchange",
        invokeBody: { code, redirectUri },
        successLabel: LABEL,
        returnUrlOverride: returnFromState,
        nativeMode: nativeFlow,
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-orange-50 to-white px-4">
      {failure ? (
        <div className="w-full max-w-md space-y-4 rounded-lg border border-destructive/30 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 flex-shrink-0 text-destructive" />
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Facebook 登入失敗</h2>
              <p className="text-sm text-muted-foreground break-words">{failure.msg}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="flex-1"
              style={{ backgroundColor: "hsl(24, 100%, 50%)" }}
              onClick={() => navigate("/member/auth", { replace: true })}
            >
              回到登入頁重新嘗試
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => navigate("/", { replace: true })}
            >
              返回首頁
            </Button>
          </div>
          {failure.debug != null && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">技術細節（回報時提供）</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-muted p-2">
                {JSON.stringify(failure.debug, null, 2)}
              </pre>
            </details>
          )}
        </div>
      ) : (
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" style={{ color: "hsl(24, 100%, 50%)" }} />
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      )}
    </div>
  );
};

export default MemberFacebookCallback;
