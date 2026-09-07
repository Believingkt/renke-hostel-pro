import { useCallback, useEffect, useRef, useState } from "react";
import { isNativeApp } from "@/lib/appMode";
import { readOfflineCache, writeOfflineCache } from "@/lib/native/offlineStore";

interface Options {
  /** 關閉時完全不做任何事（例如尚未取得 memberId） */
  enabled?: boolean;
}

export interface OfflineCacheState<T> {
  data: T | null;
  /** 首次載入中（沒有任何資料可顯示） */
  loading: boolean;
  /** 下拉更新中 */
  refreshing: boolean;
  /** 目前顯示的是離線快取內容 */
  usingCache: boolean;
  /** 快取儲存時間 */
  cachedAt: number | null;
  refresh: () => Promise<void>;
}

/**
 * 原生 App 專用的「先顯示快取、再抓最新」資料流。
 * - 瀏覽器版：不讀寫快取，行為等同單純呼叫 fetcher。
 * - 原生 App：先秀最近一次成功的資料，連線失敗時保留快取並標記 usingCache。
 */
export function useOfflineCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: Options = {},
): OfflineCacheState<T> {
  const enabled = options.enabled !== false;
  const native = isNativeApp();
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [usingCache, setUsingCache] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);

  const run = useCallback(
    async (isRefresh: boolean) => {
      if (!enabled) return;
      if (isRefresh) setRefreshing(true);
      try {
        const fresh = await fetcherRef.current();
        setData(fresh);
        setUsingCache(false);
        setCachedAt(null);
        if (native) void writeOfflineCache(key, fresh);
      } catch (e) {
        if (native) {
          const cached = await readOfflineCache<T>(key);
          if (cached) {
            setData(cached.data);
            setUsingCache(true);
            setCachedAt(cached.savedAt);
          }
        }
        if (!native) throw e;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [enabled, key, native],
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      if (native) {
        const cached = await readOfflineCache<T>(key);
        if (!cancelled && cached) {
          setData(cached.data);
          setCachedAt(cached.savedAt);
          setUsingCache(true);
          setLoading(false);
        }
      }
      if (!cancelled) await run(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, key, native, run]);

  // 恢復連線時自動更新
  useEffect(() => {
    if (!enabled) return;
    const onOnline = () => void run(true);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [enabled, run]);

  const refresh = useCallback(() => run(true), [run]);

  return { data, loading, refreshing, usingCache, cachedAt, refresh };
}

export default useOfflineCache;
