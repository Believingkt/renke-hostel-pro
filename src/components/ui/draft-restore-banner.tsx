import { AlertCircle, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface DraftRestoreBannerProps {
  onRestore: () => void;
  onDiscard: () => void;
}

/**
 * 草稿恢復橫幅組件
 * 當檢測到有草稿時顯示，讓用戶選擇恢復或放棄
 */
export function DraftRestoreBanner({ onRestore, onDiscard }: DraftRestoreBannerProps) {
  return (
    <Alert className="mb-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
      <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
      <AlertDescription className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-yellow-800 dark:text-yellow-200">
            發現未儲存的草稿，是否要恢復？
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onRestore}
            className="h-8 border-yellow-600 text-yellow-600 hover:bg-yellow-100 dark:border-yellow-500 dark:text-yellow-500 dark:hover:bg-yellow-950"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            恢復草稿
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDiscard}
            className="h-8 text-yellow-600 hover:bg-yellow-100 dark:text-yellow-500 dark:hover:bg-yellow-950"
          >
            <X className="h-3 w-3 mr-1" />
            放棄
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
