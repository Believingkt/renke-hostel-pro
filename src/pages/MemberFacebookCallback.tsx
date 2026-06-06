import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  preCheckExistingSession,
  runOAuthExchange,
} from "@/utils/oauthCallbackHandler";

const TAG = "FB";
const LABEL = "Facebook ";

const MemberFacebookCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("Facebook 登入處理中…");
  const ranRef = useRef(false);

  useEffect(() => {
    console.log(`[${TAG} callback] effect run, ranRef=`, ranRef.current);
    if (ranRef.current) return;
    ranRef.current = true;

    const finish = (path: string) => {
      console.log(`[${TAG} callback] navigate →`, path);
      if (/^https?:\/\//i.test(path)) {
        window.location.replace(path);
      } else {
        navigate(path, { replace: true });
      }
    };

    (async () => {
      // 1. Pre-check: if a session already exists, skip everything.
      const existingRedirect = await preCheckExistingSession(TAG);
      if (existingRedirect) {
        sessionStorage.removeItem("fb_oauth_state");
        sessionStorage.removeItem("fb_oauth_redirect_uri");
        finish(existingRedirect);
        return;
      }

      const code = searchParams.get("code");
      const state = searchParams.get("state");
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
      if (!storedState || state !== storedState) {
        fail("Facebook 登入 state 驗證失敗，請重新嘗試");
        return;
      }
      if (!storedRedirect) {
        fail("Facebook 登入資訊已遺失，請重新嘗試");
        return;
      }

      const result = await runOAuthExchange({
        tag: TAG,
        functionName: "facebook-oauth-exchange",
        invokeBody: { code, redirectUri: storedRedirect },
        successLabel: LABEL,
      });

      cleanup();
      if (result.ok) {
        if (result.successMessage) toast.success(result.successMessage);
        finish(result.redirectTo);
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
