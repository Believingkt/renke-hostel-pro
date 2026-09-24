// 網頁版第三方登入：改走 Supabase Auth 原生 OAuth（取代 @lovable.dev/cloud-auth-js）。
// 介面刻意與原 `lovable.auth.signInWithOAuth` 相同，呼叫端不用改。
// 前置：Supabase Dashboard → Auth → Providers 啟用 Google（需 Kenneth 提供 OAuth Client ID/Secret），
//      Redirect URLs 加入各前台網域。
import { supabase } from "@lakeze/shared/integrations/supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

type SignInResult =
  | { redirected: true; error?: undefined }
  | { redirected: false; error: Error };

export const oauth = {
  auth: {
    signInWithOAuth: async (
      provider: "google" | "apple",
      opts?: SignInOptions,
    ): Promise<SignInResult> => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: opts?.redirect_uri ?? window.location.origin,
          queryParams: opts?.extraParams,
        },
      });
      if (error) return { redirected: false, error };
      // 瀏覽器會整頁導向 provider；回來後 session 由 supabase-js 從 URL 取回並觸發 onAuthStateChange
      return { redirected: true };
    },
  },
};

