import { useCallback, useEffect, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { useAccommodation } from "@lakeze/shared/contexts/AccommodationContext";
import { useStaffPermissions } from "@lakeze/shared/hooks/use-staff-permissions";
import { useAccommodationPriceFlags } from "@lakeze/shared/hooks/useAccommodationPriceFlags";
import { useAliasPrefix } from "@lakeze/shared/hooks/use-alias-prefix";
import { AdminPageHeader } from "@lakeze/shared/components/AdminPageHeader";
import { BedDouble } from "lucide-react";
import { getAccommodationChannel } from "@/lib/owltingPackageRequirement";
import { PackageTierCard, type RoomPlanPackage } from "@/components/room-plans/PackageTierCard";

export default function RoomPlans() {
  const { currentAccommodationId } = useAccommodation();
  const flags = useAccommodationPriceFlags(currentAccommodationId);
  const { canEdit, isStrictAdmin, isStaff } = useStaffPermissions();
  // 與後端 staff_can_edit_module 一致：館別 hotel_admin／super_admin，或 room_price 可編輯的館員；泛用 admin 不可存檔
  const canSavePrices = isStrictAdmin || (isStaff && canEdit("room_price"));
  const { withPrefix } = useAliasPrefix();
  const [packages, setPackages] = useState<RoomPlanPackage[]>([]);
  const [templates, setTemplates] = useState<Array<{ template_name: string; default_package_id: string | null }>>([]);
  const [owlting, setOwlting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentAccommodationId) return;
    const [p, t] = await Promise.all([
      supabase.from("accommodation_packages")
        .select("id, name, enabled, sale_price, original_price, tier_prices")
        .eq("accommodation_id", currentAccommodationId)
        .order("display_order", { ascending: true }),
      supabase.from("pricing_templates")
        .select("template_name, default_package_id")
        .eq("accommodation_id", currentAccommodationId),
    ]);
    // 讀取失敗時保留畫面上的既有資料，只顯示錯誤
    if (!p.error) setPackages((p.data || []) as unknown as RoomPlanPackage[]);
    if (!t.error) setTemplates((t.data || []) as any);
    setLoadError(p.error || t.error ? "讀取方案失敗，請重新整理" : null);
  }, [currentAccommodationId]);

  useEffect(() => { if (flags.newPriceUiEnabled) load(); }, [flags.newPriceUiEnabled, load]);

  // 奧丁丁提示與建單 trigger 同源（accommodation_owlting_config.sync_enabled）；讀不到就不顯示、不報錯
  useEffect(() => {
    setOwlting(false);
    if (!currentAccommodationId || !flags.newPriceUiEnabled) return;
    getAccommodationChannel(currentAccommodationId).then((c) => setOwlting(c === "owlting"), () => setOwlting(false));
  }, [currentAccommodationId, flags.newPriceUiEnabled]);

  if (!flags.loaded) return null;
  if (!flags.newPriceUiEnabled) {
    return <div className="p-6 text-sm text-muted-foreground" data-testid="room-plans-disabled">此館尚未啟用「房型與方案」。</div>;
  }

  return (
    <div className="space-y-4" data-testid="room-plans-page">
      <AdminPageHeader title="房型與方案" description="編輯既有方案的平日／旺日／假日原價與官網售價" icon={BedDouble} />
      {owlting && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800" data-testid="room-plans-owlting-notice">
          新增方案後需交付奧丁丁建立對應
        </div>
      )}
      {loadError && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="room-plans-load-error">
          {loadError}
        </div>
      )}
      <p className="text-sm text-muted-foreground" data-testid="room-plans-ota-notice">OTA 售價請到 OwlNest／旭海後台調整</p>
      {packages.map((pkg) => (
        <PackageTierCard
          key={pkg.id}
          pkg={pkg}
          syncEnabled={flags.priceSyncMode === "package_original"}
          syncTemplateNames={templates.filter((t) => t.default_package_id === pkg.id).map((t) => t.template_name)}
          canEdit={canSavePrices}
          packagesLink={withPrefix("/admin/packages")}
          onSaved={load}
        />
      ))}
    </div>
  );
}
