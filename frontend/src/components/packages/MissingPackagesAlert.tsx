import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface MissingAcc {
  id: string;
  name: string;
}

/**
 * 提示：列出「尚未設定任何訂房入住方案」的館別。
 * 所有館別的前台訂房頁一律走新版包棟頁，未設方案時只會以房型呈現，
 * 因此需要讓管理者一眼看到還有哪些館別要補齊方案。
 */
export function MissingPackagesAlert() {
  const { userAccommodations, currentAccommodationId, setCurrentAccommodationId } =
    useAccommodation();
  const [missing, setMissing] = useState<MissingAcc[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: accs } = await supabase
        .from("accommodation_info")
        .select("id, name")
        .order("name");
      if (cancelled || !accs) return;

      const allowedIds = new Set(
        (userAccommodations || []).map((u) => u.accommodation_id),
      );
      const scoped =
        allowedIds.size > 0 ? accs.filter((a) => allowedIds.has(a.id)) : accs;
      if (scoped.length === 0) {
        setMissing([]);
        return;
      }

      const { data: pkgs } = await (supabase as any)
        .from("accommodation_packages")
        .select("accommodation_id")
        .in(
          "accommodation_id",
          scoped.map((a) => a.id),
        );
      if (cancelled) return;

      const withPkgs = new Set(
        ((pkgs as Array<{ accommodation_id: string }>) || []).map(
          (p) => p.accommodation_id,
        ),
      );
      setMissing(
        scoped
          .filter((a) => !withPkgs.has(a.id))
          .map((a) => ({ id: a.id, name: a.name })),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [userAccommodations]);

  if (missing.length === 0) return null;

  return (
    <div
      data-testid="missing-packages-alert"
      className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            以下 {missing.length} 間館別尚未設定訂房入住方案
          </p>
          <p className="text-xs text-muted-foreground">
            前台訂房頁已統一使用新版包棟頁；未設定方案的館別只會以房型清單呈現，建議儘快補齊方案卡。
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-6">
        {missing.map((m) => (
          <Button
            key={m.id}
            type="button"
            size="sm"
            variant={m.id === currentAccommodationId ? "secondary" : "outline"}
            onClick={() => setCurrentAccommodationId(m.id)}
          >
            {m.name}
          </Button>
        ))}
      </div>
    </div>
  );
}

export default MissingPackagesAlert;
