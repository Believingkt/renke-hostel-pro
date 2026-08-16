import { FlaskConical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface Props {
  enabled: boolean;
  onChange: (v: boolean) => void;
  visible: boolean;
}

/**
 * 「排除業主自帶（試算）」開關 — 僅 super_admin / admin 可見。
 * 開啟後卡片主數字仍為實付金額，僅在下方多一行灰字對照。
 */
export function OwnerDirectSimToggle({ enabled, onChange, visible }: Props) {
  if (!visible) return null;
  return (
    <Card className="border-dashed">
      <CardContent className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 text-sm font-medium shrink-0">
          <FlaskConical className="h-4 w-4 text-muted-foreground" />
          排除業主自帶（試算）
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="owner-direct-sim"
            checked={enabled}
            onCheckedChange={onChange}
          />
          <Label htmlFor="owner-direct-sim" className="text-xs text-muted-foreground">
            {enabled
              ? "已開啟：卡片下方顯示「排除業主自帶」對照金額，僅供參考"
              : "關閉時僅顯示實付金額"}
          </Label>
        </div>
      </CardContent>
    </Card>
  );
}

export default OwnerDirectSimToggle;
