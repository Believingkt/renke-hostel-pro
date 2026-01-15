import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TapPayEnv = "production" | "sandbox";

export type TapPayConfig = {
  appId: string;
  appKey: string;
  env: TapPayEnv;
};

function normalizeEnv(env: unknown): TapPayEnv {
  return env === "sandbox" ? "sandbox" : "production";
}

export function useTapPayConfig(enabled: boolean) {
  const [config, setConfig] = useState<TapPayConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke("tappay-config");
      if (error) throw error;

      const cfg = data as any;
      if (!cfg?.appId || !cfg?.appKey) {
        throw new Error("TapPay 設定缺失（請檢查後端金鑰）");
      }

      setConfig({
        appId: String(cfg.appId),
        appKey: String(cfg.appKey),
        env: normalizeEnv(cfg.env),
      });
    } catch (e: any) {
      setConfig(null);
      setError(e?.message || "無法取得 TapPay 設定");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    reload();
  }, [enabled, reload]);

  return { config, loading, error, reload };
}
