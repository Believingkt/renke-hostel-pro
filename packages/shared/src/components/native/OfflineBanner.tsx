import { CloudOff } from "lucide-react";

interface Props {
  /** 是否顯示（通常來自 useOfflineCache 的 usingCache 或 navigator.onLine） */
  show: boolean;
  cachedAt?: number | null;
}

function formatTime(ts?: number | null) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** 離線模式提示條（顯示於內容頂部，僅原生 App 會被觸發） */
export function OfflineBanner({ show, cachedAt }: Props) {
  if (!show) return null;
  const time = formatTime(cachedAt);
  return (
    <div className="flex items-center justify-center gap-2 bg-muted px-3 py-2 text-xs text-muted-foreground">
      <CloudOff className="h-3.5 w-3.5" />
      <span>離線模式{time ? `．顯示 ${time} 的資料` : "．顯示先前存下的資料"}</span>
    </div>
  );
}

export default OfflineBanner;
