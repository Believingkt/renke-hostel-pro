import { Wifi, WifiOff, Zap } from "lucide-react";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { cn } from "@/lib/utils";

/**
 * 網路狀態指示器組件
 * 顯示當前網路連線速度
 */
export const NetworkIndicator = () => {
  const { speed, effectiveType, saveData } = useNetworkStatus();

  // 不顯示快速網路的指示器
  if (speed === 'fast' && !saveData) {
    return null;
  }

  return (
    <div className={cn(
      "fixed bottom-4 right-4 z-50 px-3 py-2 rounded-lg shadow-lg transition-all duration-300",
      "flex items-center gap-2 text-sm font-medium",
      speed === 'offline' && "bg-destructive text-destructive-foreground",
      speed === 'slow' && "bg-amber-500 text-white",
      saveData && "bg-blue-500 text-white"
    )}>
      {speed === 'offline' && (
        <>
          <WifiOff className="h-4 w-4" />
          <span>離線模式</span>
        </>
      )}
      {speed === 'slow' && !saveData && (
        <>
          <Wifi className="h-4 w-4" />
          <span>慢速網路 ({effectiveType})</span>
        </>
      )}
      {saveData && (
        <>
          <Zap className="h-4 w-4" />
          <span>數據節省模式</span>
        </>
      )}
    </div>
  );
};
