import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, ArrowDown } from "lucide-react";
import { isNativeApp } from "@/lib/appMode";
import { hapticSelection } from "@/lib/native/haptics";

interface Props {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
  /** 觸發門檻（px） */
  threshold?: number;
  disabled?: boolean;
}

/**
 * 下拉更新：只在原生 App 啟用，瀏覽器版直接透傳 children（無任何行為改變）。
 * 以視窗捲動位置判斷，僅在頁面已捲到最頂端時才接管手勢。
 */
export function PullToRefresh({ onRefresh, children, threshold = 70, disabled }: Props) {
  const native = isNativeApp();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const startY = useRef<number | null>(null);
  const armed = useRef(false);
  const passed = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!native || disabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (busy) return;
      if (window.scrollY > 0) {
        armed.current = false;
        return;
      }
      armed.current = true;
      passed.current = false;
      startY.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!armed.current || startY.current == null || busy) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0 || window.scrollY > 0) {
        setPull(0);
        return;
      }
      const damped = Math.min(delta * 0.5, threshold * 1.6);
      setPull(damped);
      if (!passed.current && damped >= threshold) {
        passed.current = true;
        void hapticSelection();
      }
    };

    const onTouchEnd = async () => {
      if (!armed.current) return;
      armed.current = false;
      startY.current = null;
      if (pull >= threshold && !busy) {
        setBusy(true);
        setPull(threshold);
        try {
          await onRefreshRef.current();
        } finally {
          setBusy(false);
          setPull(0);
        }
      } else {
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [native, disabled, busy, pull, threshold]);

  if (!native) return <>{children}</>;

  const offset = busy ? threshold * 0.7 : pull;

  return (
    <div>
      <div
        className="pointer-events-none flex items-end justify-center overflow-hidden text-muted-foreground transition-[height] duration-150"
        style={{ height: offset }}
        aria-hidden={offset === 0}
      >
        {offset > 8 && (
          <span className="pb-2">
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <ArrowDown
                className="h-5 w-5 transition-transform"
                style={{ transform: pull >= threshold ? "rotate(180deg)" : "none" }}
              />
            )}
          </span>
        )}
      </div>
      <div style={{ transform: `translateY(${offset ? 0 : 0}px)` }}>{children}</div>
    </div>
  );
}

export default PullToRefresh;
