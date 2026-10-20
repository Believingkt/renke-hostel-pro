import { useEffect, useRef } from "react";
import { Label } from "@lakeze/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@lakeze/shared/components/ui/select";
import { Alert, AlertDescription } from "@lakeze/shared/components/ui/alert";
import { Checkbox } from "@lakeze/shared/components/ui/checkbox";
import { AlertTriangle } from "lucide-react";
import type { PackageResolution } from "@/lib/orderPackageResolution";

/** 房型／專案組合由「完整」變成另一個組合時呼叫 onReset（初次載入不觸發） */
export function useResetOnRoomTemplateChange(key: string, complete: boolean, onReset: () => void) {
  const prev = useRef<{ key: string; complete: boolean } | null>(null);
  const resetRef = useRef(onReset);
  resetRef.current = onReset;
  useEffect(() => {
    const p = prev.current;
    if (p && p.complete && p.key !== key) resetRef.current();
    prev.current = { key, complete };
  }, [key, complete]);
}

interface OrderPackageFieldProps {
  resolution: PackageResolution;
  manualPick: string;
  onManualPick: (packageId: string) => void;
  isRequired: boolean;
  channelLabel: string;
  roomTypeName: (id: string) => string;
}

export function OrderPackageField({ resolution, manualPick, onManualPick, isRequired, channelLabel, roomTypeName }: OrderPackageFieldProps) {
  return (
    <div className="space-y-2" data-testid="order-package-field">
      {resolution.mode === "auto" && (
        <div className="text-sm" data-testid="order-package-auto">
          對應方案：<span className="font-medium">{resolution.packageName ?? "（方案已停用或不存在）"}</span>
          <span className="text-xs text-muted-foreground">（依專案自動帶入）</span>
        </div>
      )}
      {resolution.mode === "none" && (
        <div className="text-xs text-muted-foreground" data-testid="order-package-none">
          對應方案：此專案未綁定方案，留空
        </div>
      )}
      {resolution.mode === "manual" && (
        <ManualPackageSelect
          resolution={resolution}
          manualPick={manualPick}
          onManualPick={onManualPick}
          isRequired={isRequired}
          channelLabel={channelLabel}
        />
      )}
      {resolution.conflict && <PackageConflictAlert resolution={resolution} roomTypeName={roomTypeName} channelLabel={channelLabel} />}
    </div>
  );
}

function ManualPackageSelect({ resolution, manualPick, onManualPick, isRequired, channelLabel }: Omit<OrderPackageFieldProps, "roomTypeName">) {
  const value = resolution.options.some((p) => p.id === manualPick) ? manualPick : "none";
  return (
    <>
      <Label>
        對應方案
        {isRequired ? <span className="text-destructive"> *</span> : <span className="text-muted-foreground text-xs">（選填）</span>}
      </Label>
      <Select value={value} onValueChange={(v) => onManualPick(v === "none" ? "" : v)}>
        <SelectTrigger className="h-12 text-base sm:h-10 sm:text-sm" data-testid="order-package-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">（未指定，留空）</SelectItem>
          {resolution.options.map((p) => (
            <SelectItem key={p.id} value={p.id} data-testid={`order-package-option-${p.id}`}>
              {p.name}（{p.guest_count} 人）
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground" data-testid="order-package-manual-hint">
        此專案未綁定方案；只列出涵蓋第一間房房型的方案，推送 {channelLabel} 時以此為準。換房型或專案會自動清空。
        {resolution.options.length === 0 && " 目前沒有方案涵蓋此房型。"}
      </p>
    </>
  );
}

function PackageConflictAlert({ resolution, roomTypeName, channelLabel }: { resolution: PackageResolution; roomTypeName: (id: string) => string; channelLabel: string }) {
  return (
    <Alert variant="destructive" data-testid="order-package-conflict-alert">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="space-y-1 text-sm">
        <div className="font-medium">各房專案綁定的方案不同</div>
        <ul className="list-disc pl-4">
          {resolution.roomPackages.map((r, i) => (
            <li key={i}>第 {i + 1} 間 {roomTypeName(r.room_type_id)}：{r.packageName ?? "（專案未綁方案）"}</li>
          ))}
        </ul>
        <div>
          訂單的對應方案以第 1 間房為準（{resolution.packageName ?? "留空"}），和訂單專案一致；其他房間仍各自記錄所選專案，房價、庫存不受影響。
          {channelLabel === "奧丁丁" && " 推送奧丁丁時，其他房間會改用該房型在奧丁丁設定的預設方案。"}
          若各房必須分別對應不同方案，請改為分開建立訂單。
        </div>
      </AlertDescription>
    </Alert>
  );
}

interface TemplateFallbackWarningProps {
  roomTypeNames: string[];
  confirmed: boolean;
  onConfirmedChange: (v: boolean) => void;
}

export function TemplateFallbackWarning({ roomTypeNames, confirmed, onConfirmedChange }: TemplateFallbackWarningProps) {
  if (roomTypeNames.length === 0) return null;
  return (
    <Alert variant="destructive" data-testid="template-fallback-warning">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="space-y-2 text-sm">
        <div>此房型在入住日沒有對應專案，請確認（{roomTypeNames.join("、")}）。目前專案清單列出的是全館專案。</div>
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={confirmed}
            onCheckedChange={(v) => onConfirmedChange(v === true)}
            data-testid="template-fallback-confirm-checkbox"
          />
          <span>我已確認所選專案正確</span>
        </label>
      </AlertDescription>
    </Alert>
  );
}
