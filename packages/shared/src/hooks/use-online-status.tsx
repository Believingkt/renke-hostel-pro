import { useEffect, useState } from "react";
import { isNativeApp } from "@lakeze/shared/lib/appMode";

/**
 * 連線狀態：瀏覽器 online/offline 事件 + 原生 App 的 @capacitor/network。
 * 回傳 true 代表目前有網路。
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    let remove: (() => void) | undefined;
    if (isNativeApp()) {
      void (async () => {
        try {
          const { Network } = await import("@capacitor/network");
          const status = await Network.getStatus();
          setOnline(status.connected);
          const handle = await Network.addListener("networkStatusChange", (s) =>
            setOnline(s.connected),
          );
          remove = () => void handle.remove();
        } catch {
          /* 原生外掛不可用時沿用瀏覽器事件 */
        }
      })();
    }

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      remove?.();
    };
  }, []);

  return online;
}

export default useOnlineStatus;
