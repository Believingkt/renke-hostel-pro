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

// 模組層快取：付款頁多個元件／重新掛載時共用同一份設定，
// 避免重複呼叫 edge function（每次冷啟動都要等待，造成付款頁 loading 過久）
let cachedConfig: TapPayConfig | null = null;
let inflight: Promise<TapPayConfig> | null = null;

async function fetchTapPayConfig(): Promise<TapPayConfig> {
  if (cachedConfig) return cachedConfig;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase.functions.invoke("tappay-config");
    if (error) throw error;
    const cfg = data as any;
    if (!cfg?.appId || !cfg?.appKey) {
      throw new Error("TapPay 設定缺失（請檢查後端金鑰）");
    }
    const normalized: TapPayConfig = {
      appId: String(cfg.appId),
      appKey: String(cfg.appKey),
      env: normalizeEnv(cfg.env),
    };
    cachedConfig = normalized;
    return normalized;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function useTapPayConfig(enabled: boolean) {
  const [config, setConfig] = useState<TapPayConfig | null>(cachedConfig);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setConfig(await fetchTapPayConfig());
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
