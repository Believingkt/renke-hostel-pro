import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  preCheckExistingSession,
  runOAuthExchange,
  decodeReturnUrlFromState,
} from "@/utils/oauthCallbackHandler";

const TAG = "FB";
const LABEL = "Facebook ";
const FALLBACK_REDIRECT_URI = "https://booking.lakeze.com/member/auth/facebook-callback";

const MemberFacebookCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("Facebook 登入處理中…");
  const ranRef = useRef(false);

  useEffect(() => {
    console.log(`[${TAG} callback] effect run, ranRef=`, ranRef.current);
    if (ranRef.current) return;
    ranRef.current = true;

    const finish = (path: string, tokens?: { access?: string; refresh?: string }) => {
      console.log(`[${TAG} callback] navigate →`, path);
      if (/^https?:\/\//i.test(path)) {
        let target = path;
        // Cross-origin handoff: append tokens via URL fragment so the target
        // origin can call supabase.auth.setSession() locally (localStorage is
        // per-origin and the session created here on booking.lakeze.com is
        // invisible to e.g. sensaninn.lakeze.com otherwise).
        try {
          const u = new URL(path);
          if (u.origin !== window.location.origin && tokens?.access && tokens?.refresh) {
            const frag = new URLSearchParams({
              access_token: tokens.access,
              refresh_token: tokens.refresh,
              source: "oauth_handoff",
            });
            u.hash = (u.hash ? u.hash.replace(/^#/, "") + "&" : "") + frag.toString();
            target = u.toString();
          }
        } catch {
          /* keep original path */
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

      // 1. Pre-check: if a session already exists, skip everything.
      const existingRedirect = await preCheckExistingSession(TAG, returnFromState);
      if (existingRedirect) {
        sessionStorage.removeItem("fb_oauth_state");
        sessionStorage.removeItem("fb_oauth_redirect_uri");
        finish(existingRedirect);
        return;
      }

      const code = searchParams.get("code");
      const errorParam = searchParams.get("error");
      const errorReason =
        searchParams.get("error_reason") || searchParams.get("error_description");

      const storedState = sessionStorage.getItem("fb_oauth_state");
      const storedRedirect = sessionStorage.getItem("fb_oauth_redirect_uri");

      const cleanup = () => {
        sessionStorage.removeItem("fb_oauth_state");
        sessionStorage.removeItem("fb_oauth_redirect_uri");
      };

      const fail = (msg: string) => {
        cleanup();
        toast.error(msg);
        setMessage(msg);
        setTimeout(() => navigate("/member/auth", { replace: true }), 1500);
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
      if (storedState) {
        if (state !== storedState) {
          fail("Facebook 登入 state 驗證失敗，請重新嘗試");
          return;
        }
      } else if (!returnFromState) {
        fail("Facebook 登入 state 驗證失敗，請重新嘗試");
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
        finish(result.redirectTo, { access: result.accessToken, refresh: result.refreshToken });
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
