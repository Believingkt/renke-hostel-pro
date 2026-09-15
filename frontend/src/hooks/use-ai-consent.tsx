import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * AI 管家（小安）資料傳送同意狀態
 * - 已登入會員：存在資料庫 ai_assistant_consents（跨裝置、可隨時撤回）
 * - 未登入訪客：僅存本機（localStorage），登入後以帳號紀錄為準
 */
const LS_KEY = "ai_assistant_consent_v2";
export const AI_CONSENT_VERSION = "v2";

export type AiConsentStatus = "loading" | "granted" | "not_granted" | "declined";

export function useAiConsent() {
  const [status, setStatus] = useState<AiConsentStatus>("loading");
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;
    setUserId(uid);

    if (uid) {
      const { data: row } = await supabase
        .from("ai_assistant_consents")
        .select("consented, consent_version")
        .eq("user_id", uid)
        .maybeSingle();
      setStatus(row?.consented && row.consent_version === AI_CONSENT_VERSION ? "granted" : "not_granted");
      return;
    }

    try {
      setStatus(localStorage.getItem(LS_KEY) === "granted" ? "granted" : "not_granted");
    } catch {
      setStatus("not_granted");
    }
  }, []);

  useEffect(() => {
    void load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void load();
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const grant = useCallback(async () => {
    setStatus("granted");
    try {
      localStorage.setItem(LS_KEY, "granted");
    } catch {
      /* ignore */
    }
    if (userId) {
      await supabase.from("ai_assistant_consents").upsert(
        {
          user_id: userId,
          consented: true,
          consent_version: AI_CONSENT_VERSION,
          consented_at: new Date().toISOString(),
          revoked_at: null,
        },
        { onConflict: "user_id" },
      );
    }
  }, [userId]);

  const revoke = useCallback(async () => {
    setStatus("not_granted");
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
    if (userId) {
      await supabase.from("ai_assistant_consents").upsert(
        {
          user_id: userId,
          consented: false,
          consent_version: AI_CONSENT_VERSION,
          revoked_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    }
  }, [userId]);

  const decline = useCallback(() => {
    setStatus("declined");
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return { status, granted: status === "granted", grant, revoke, decline, reload: load };
}
