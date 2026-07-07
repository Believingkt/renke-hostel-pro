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

const TAG = "LINE";
const LABEL = "LINE ";
const FALLBACK_REDIRECT_URI = "https://booking.lakeze.com/member/auth/line-callback";

const MemberLineCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("LINE 登入處理中…");
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
      // LINE state format from payment page: <random>.<returnB64>.<nonce>
      const returnFromState = decodeReturnUrlFromState(state);
      const nonceFromState = state && state.split(".").length >= 3
        ? state.split(".")[2]
        : null;
      console.log(`[${TAG} callback] returnFromState=`, returnFromState, "nonceFromState=", !!nonceFromState);

      // 1. Pre-check: if a session already exists, skip everything.
      const existingRedirect = await preCheckExistingSession(TAG, returnFromState);
      if (existingRedirect) {
        localStorage.removeItem("line_oauth_state");
        localStorage.removeItem("line_oauth_nonce");
        localStorage.removeItem("line_oauth_redirect_uri");
        localStorage.removeItem("line_oauth_ts");
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
      const storedTs = Number(localStorage.getItem("line_oauth_ts") || 0);
      const TTL_MS = 10 * 60 * 1000;
      const expired = storedTs > 0 && Date.now() - storedTs > TTL_MS;

      const cleanup = () => {
        localStorage.removeItem("line_oauth_state");
        localStorage.removeItem("line_oauth_nonce");
        localStorage.removeItem("line_oauth_redirect_uri");
        localStorage.removeItem("line_oauth_ts");
        sessionStorage.removeItem("line_oauth_state");
        sessionStorage.removeItem("line_oauth_nonce");
        sessionStorage.removeItem("line_oauth_redirect_uri");
      };

      const fail = (msg: string, debug?: unknown) => {
        cleanup();
        toast.error(msg);
        setMessage(msg);
        setFailure({ msg, debug });
      };

      if (errorParam) {
        fail(`LINE 登入失敗：${errorDescription || errorParam}`);
        return;
      }
      if (!code || !state) {
        fail("LINE 回呼參數不完整");
        return;
      }

      if (expired) {
        fail("LINE 登入已逾時，請重新登入");
        return;
      }

      // State validation: same-origin → strict; cross-origin → state must
      // carry our embedded return URL marker.
      const stateDebug = {
        hasStoredState: !!storedState,
        hasReturnFromState: !!returnFromState,
        hasStoredNonce: !!storedNonce,
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
          fail("LINE 登入驗證失敗，可能因為分頁被切換。請回到登入頁重新登入。", stateDebug);
          return;
        }
      } else if (!returnFromState) {
        console.warn(`[${TAG} callback] state missing (no storedState, no embedded return)`, stateDebug);
        fail("LINE 登入資訊遺失，請回到登入頁重新登入。", stateDebug);
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-orange-50 to-white px-4">
      {failure ? (
        <div className="w-full max-w-md space-y-4 rounded-lg border border-destructive/30 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 flex-shrink-0 text-destructive" />
            <div className="space-y-1">
              <h2 className="text-base font-semibold">LINE 登入失敗</h2>
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

export default MemberLineCallback;
