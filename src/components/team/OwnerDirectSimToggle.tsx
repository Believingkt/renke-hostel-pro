import { FlaskConical, HelpCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
      <CardContent className="py-3 flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 text-sm font-medium shrink-0">
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            排除業主自帶（試算）
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="說明：排除業主自帶試算"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 text-xs leading-relaxed">
                <p className="mb-1 text-sm font-semibold">這是什麼</p>
                <p className="mb-2 text-muted-foreground">
                  以「排除業主自帶訂單」重新試算獎金，讓你比對業主自有通路訂單對獎金的影響。
                </p>
                <p className="mb-1 text-sm font-semibold">重要提醒</p>
                <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                  <li>純試算檢視，<strong>不會改變任何實際發放金額</strong>。</li>
                  <li>只影響你自己的畫面，其他成員看到的數字完全不變。</li>
                  <li>卡片主數字永遠是實付金額，試算值以灰字顯示在下方。</li>
                  <li>僅 super_admin／admin 看得到此開關，偏好只記在本機。</li>
                </ul>
              </PopoverContent>
            </Popover>
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
        </div>
        <p className="text-xs text-muted-foreground">
          試算模式不影響實際發放，也不會改變其他人看到的數字。
        </p>
      </CardContent>
    </Card>
  );
}

export default OwnerDirectSimToggle;
