import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { isNativeApp } from "@lakeze/shared/lib/appMode";
import NativeNavBar, { resolveNativeTitle } from "@lakeze/shared/components/native/NativeNavBar";
import NativeTabBar from "@lakeze/shared/components/native/NativeTabBar";
import OfflineBanner from "@lakeze/shared/components/native/OfflineBanner";
import { useOnlineStatus } from "@lakeze/shared/hooks/use-online-status";

/** 這些路徑不套用 App 外殼（付款流程、外部導轉頁等維持原樣） */
const SHELL_EXCLUDED = [
  /^\/pay(\/|$)/,
  /^\/payment-(?!result)/,
  /^\/liff\//,
  /^\/admin/,
  /^\/team/,
  /^\/hq/,
];

function isShellPath(pathname: string) {
  return !SHELL_EXCLUDED.some((re) => re.test(pathname));
}

interface Props {
  children: ReactNode;
}

/**
 * 原生 App 外殼：iOS 導覽列、底部 Tab Bar、離線提示、頁面轉場。
 * 瀏覽器版（isNativeApp() === false）完全透傳 children，不做任何改變。
 */
export function NativeShell({ children }: Props) {
  const native = isNativeApp();
  const location = useLocation();
  const navType = useNavigationType();
  const online = useOnlineStatus();

  // 原生模式：在 <html> 掛上旗標，供全站 CSS 隱藏網站型頁首／頁尾
  useEffect(() => {
    if (!native) return;
    document.documentElement.classList.add("native-app");
    return () => document.documentElement.classList.remove("native-app");
  }, [native]);

  if (!native) return <>{children}</>;

  const shell = isShellPath(location.pathname);
  const hasNavBar = shell && !!resolveNativeTitle(location.pathname);
  const isPush = navType === "PUSH";

  return (
    <div className="native-shell">
      {hasNavBar && <NativeNavBar />}
      {/* 導覽列高度佔位（固定定位的 NavBar 不佔流；安全區域由 .native-shell 統一預留） */}
      {hasNavBar && (
        <div style={{ height: "2.75rem" }} aria-hidden />
      )}
      <OfflineBanner show={!online} />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={location.pathname}
          initial={isPush ? { x: "100%" } : false}
          animate={{ x: 0 }}
          transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
          style={{
            paddingBottom: shell ? "calc(50px + env(safe-area-inset-bottom, 0px))" : undefined,
          }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
      {shell && <NativeTabBar />}
    </div>
  );
}

export default NativeShell;
