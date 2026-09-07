import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isNativeApp } from "@/lib/appMode";
import NativeNavBar, { resolveNativeTitle } from "@/components/native/NativeNavBar";
import NativeTabBar from "@/components/native/NativeTabBar";
import { hapticSelection } from "@/lib/native/haptics";

/** 這些路徑不套用 App 外殼（付款流程、外部導轉頁等維持原樣） */
const SHELL_EXCLUDED = [/^\/pay/, /^\/payment-/, /^\/liff\//, /^\/admin/, /^\/team/, /^\/hq/];

function isShellPath(pathname: string) {
  return !SHELL_EXCLUDED.some((re) => re.test(pathname));
}

interface Props {
  children: ReactNode;
}

/**
 * 原生 App 外殼：iOS 導覽列、底部 Tab Bar、左右滑動轉場、左緣右滑返回。
 * 瀏覽器版（isNativeApp() === false）完全透傳 children，不做任何改變。
 */
export function NativeShell({ children }: Props) {
  const native = isNativeApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [direction, setDirection] = useState<"forward" | "back" | "none">("none");
  const historyRef = useRef<string[]>([]);
  const lastPath = useRef(location.pathname);

  // 判斷是前進（滑入）還是返回（滑出）
  useEffect(() => {
    if (!native) return;
    const path = location.pathname;
    if (path === lastPath.current) return;
    const stack = historyRef.current;
    const idx = stack.lastIndexOf(path);
    if (idx >= 0) {
      historyRef.current = stack.slice(0, idx + 1);
      setDirection("back");
    } else {
      historyRef.current = [...stack, path];
      setDirection("forward");
    }
    lastPath.current = path;
  }, [location.pathname, native]);

  // 從螢幕左緣右滑返回
  useEffect(() => {
    if (!native) return;
    let startX: number | null = null;
    let startY = 0;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t.clientX <= 24 ? t.clientX : null;
      startY = t.clientY;
    };
    const onEnd = (e: TouchEvent) => {
      if (startX == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      startX = null;
      if (dx > 80 && dy < 60) {
        const entry = resolveNativeTitle(window.location.pathname);
        if (entry && !entry.root) {
          void hapticSelection();
          navigate(-1);
        }
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [native, navigate]);

  if (!native) return <>{children}</>;

  const shell = isShellPath(location.pathname);
  const hasNavBar = shell && !!resolveNativeTitle(location.pathname);

  return (
    <div className="native-shell">
      {hasNavBar && <NativeNavBar />}
      <div
        key={location.pathname}
        className={
          direction === "forward"
            ? "native-page-enter"
            : direction === "back"
              ? "native-page-back"
              : undefined
        }
        style={{
          paddingTop: hasNavBar ? "calc(2.75rem + env(safe-area-inset-top, 0px))" : undefined,
          paddingBottom: shell ? "calc(50px + env(safe-area-inset-bottom, 0px))" : undefined,
        }}
      >
        {children}
      </div>
      {shell && <NativeTabBar />}
    </div>
  );
}

export default NativeShell;
