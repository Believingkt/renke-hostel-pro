import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingOverlayProps {
  message?: string;
  fullScreen?: boolean;
  className?: string;
}

/**
 * 通用載入覆蓋層組件
 * 用於顯示載入狀態，支援全螢幕和局部覆蓋
 */
export function LoadingOverlay({ 
  message = "載入中...", 
  fullScreen = false,
  className 
}: LoadingOverlayProps) {
  return (
    <div 
      className={cn(
        "flex flex-col items-center justify-center gap-3 sm:gap-4",
        fullScreen ? "fixed inset-0 bg-background/80 backdrop-blur-sm z-50" : "py-8 sm:py-12 md:py-16",
        className
      )}
    >
      <Loader2 className="h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 animate-spin text-primary" />
      {message && (
        <p className="text-sm sm:text-base md:text-lg text-muted-foreground font-medium animate-pulse">
          {message}
        </p>
      )}
    </div>
  );
}
