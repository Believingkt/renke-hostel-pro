import { useMemo } from "react";
import { isNativeApp } from "@/lib/appMode";

/** 是否執行於 Capacitor 原生 App（瀏覽器版永遠 false） */
export function useIsNativeApp(): boolean {
  return useMemo(() => isNativeApp(), []);
}

export default useIsNativeApp;
