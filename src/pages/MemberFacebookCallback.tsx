import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Facebook Login callback page.
// Facebook redirects browser to /member/auth/facebook-callback?code=...&state=...
// We verify state, exchange code via edge function, then setSession.

const MemberFacebookCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("Facebook 登入處理中…");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const errorParam = searchParams.get("error");
    const errorReason = searchParams.get("error_reason") || searchParams.get("error_description");

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

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("facebook-oauth-exchange", {
          body: { code, redirectUri: storedRedirect },
        });
        if (error) throw new Error(error.message || "Facebook 授權碼交換失敗");
        if (!data?.access_token || !data?.refresh_token) {
          throw new Error(data?.error || "未收到 Supabase session");
        }

        const { error: setErr } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        if (setErr) throw setErr;

        cleanup();
        toast.success("Facebook 登入成功");
        navigate("/member", { replace: true });
      } catch (err: any) {
        console.error("Facebook callback error", err);
        fail(err?.message || "Facebook 登入失敗");
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
