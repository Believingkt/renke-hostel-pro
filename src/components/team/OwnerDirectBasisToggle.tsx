import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  OWNER_DIRECT_BASIS_LABEL,
  type OwnerDirectBasis,
} from "@/hooks/use-owner-direct-basis";

interface Props {
  basis: OwnerDirectBasis;
  setBasis: (b: OwnerDirectBasis) => void;
  canSwitch: boolean;
}

const OPTIONS: OwnerDirectBasis[] = ["payout", "include_owner_direct", "exclude_owner_direct"];

/** 業主自帶雙軌切換鈕（TeamHome／發放管理／業績統計共用） */
export function OwnerDirectBasisToggle({ basis, setBasis, canSwitch }: Props) {
  if (!canSwitch) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border p-0.5">
        {OPTIONS.map((opt) => (
          <Button
            key={opt}
            type="button"
            size="sm"
            variant={basis === opt ? "default" : "ghost"}
            className="h-7 px-2 text-xs"
            onClick={() => setBasis(opt)}
          >
            {OWNER_DIRECT_BASIS_LABEL[opt]}
          </Button>
        ))}
      </div>
      {basis !== "payout" && (
        <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          僅供參考，非實付金額
        </span>
      )}
    </div>
  );
}

export default OwnerDirectBasisToggle;
