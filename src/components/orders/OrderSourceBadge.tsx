import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getOrderSourceConfig,
  getOrderOtaCode,
  getOrderSourceDisplayName,
  getHotelnabeOtaDisplayName,
  OWLTING_OTA_DISPLAY_NAMES,
} from "@/utils/orderHelpers";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface OrderSourceBadgeProps {
  order: { order_source?: string | null; hotelnabe_sync_state?: any; ota_channel?: string | null } | null | undefined;
  className?: string;
  leadingIcon?: ReactNode;
}

/**
 * 訂單來源標籤（含 Tooltip 對照說明）。
 * hover 時顯示 code / 顯示名稱 / OTA 通路對照，方便管理員辨識來源。
 */
export function OrderSourceBadge({ order, className, leadingIcon }: OrderSourceBadgeProps) {
  const source = order?.order_source ?? "";
  const otaCode = getOrderOtaCode(order);
  const cfg = getOrderSourceConfig(source, otaCode);
  const sourceName = getOrderSourceDisplayName(source);
  const otaName = otaCode
    ? (source === "owlting"
        ? (OWLTING_OTA_DISPLAY_NAMES[otaCode.toLowerCase()] ?? otaCode)
        : getHotelnabeOtaDisplayName(otaCode))
    : null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border cursor-help",
              cfg.className,
              className,
            )}
          >
            {leadingIcon}
            {cfg.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1 text-xs">
            <div className="flex gap-2">
              <span className="text-muted-foreground">來源 code：</span>
              <span className="font-mono">{source || "—"}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground">顯示名稱：</span>
              <span>{sourceName}</span>
            </div>
            {otaCode && (
              <>
                <div className="border-t border-border/50 my-1" />
                <div className="flex gap-2">
                  <span className="text-muted-foreground">OTA code：</span>
                  <span className="font-mono">{otaCode}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground">OTA 通路：</span>
                  <span>{otaName}</span>
                </div>
              </>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
