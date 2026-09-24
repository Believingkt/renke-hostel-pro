import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { isNativeApp } from "@lakeze/shared/lib/appMode";

interface PageTransitionProps {
  children: React.ReactNode;
}

export const PageTransition = ({ children }: PageTransitionProps) => {
  const location = useLocation();
  const [isTransitioning, setIsTransitioning] = useState(false);
  // 原生 App 由 NativeShell 負責左右滑動轉場，這裡不再疊加淡入淡出
  const native = isNativeApp();

  useEffect(() => {
    if (native) return;
    // 開始過渡
    setIsTransitioning(true);

    // 滾動到頂部
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 過渡完成
    const timer = setTimeout(() => {
      setIsTransitioning(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [location.pathname, native]);

  useEffect(() => {
    if (!native) return;
    window.scrollTo({ top: 0 });
  }, [location.pathname, native]);

  if (native) return <>{children}</>;

  return (
    <div
      className={`
        transition-opacity duration-300 ease-out
        ${isTransitioning ? 'opacity-0' : 'opacity-100'}
      `}
    >
      {children}
    </div>
  );
};
