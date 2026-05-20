import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// LINE Login OIDC callback page.
// LINE redirects the browser to:
//   /member/auth/line-callback?code=...&state=...
// We:
//   1. Verify state matches sessionStorage('line_oauth_state')
//   2. POST { code, redirectUri, expectedNonce } to the
//      line-oauth-exchange edge function
//   3. Take returned id_token + nonce -> supabase.auth.signInWithIdToken
//   4. Navigate to /member on success

const MemberLineCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("LINE 登入處理中…");
  const ranRef = useRef(false);

  useEffect(() => {
    // StrictMode dev mounts effects twice; ensure the OAuth code is only
    // exchanged once (LINE codes are single-use).
    if (ranRef.current) return;
    ranRef.current = true;

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const errorParam = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    const storedState = sessionStorage.getItem("line_oauth_state");
    const storedNonce = sessionStorage.getItem("line_oauth_nonce");
    const storedRedirect = sessionStorage.getItem("line_oauth_redirect_uri");

    const cleanup = () => {
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
    if (!storedState || state !== storedState) {
      fail("LINE 登入 state 驗證失敗，請重新嘗試");
      return;
    }
    if (!storedNonce || !storedRedirect) {
      fail("LINE 登入資訊已遺失，請重新嘗試");
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("line-oauth-exchange", {
          body: {
            code,
            redirectUri: storedRedirect,
            expectedNonce: storedNonce,
          },
        });
        if (error) throw new Error(error.message || "LINE 授權碼交換失敗");
        if (!data?.access_token || !data?.refresh_token) {
          throw new Error(data?.error || "未收到 Supabase session");
        }

        const { error: setErr } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        if (setErr) throw setErr;

        cleanup();
        toast.success("LINE 登入成功");
        // onAuthStateChange listener (registered in MemberAuth/global) will
        // upsert platform_members; we just redirect.
        navigate("/member/orders", { replace: true });
      } catch (err: any) {
        console.error("LINE callback error", err);
        fail(err?.message || "LINE 登入失敗");
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
