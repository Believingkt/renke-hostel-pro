import { useCallback, useEffect, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";

export interface WizardRoomType { id: string; name: string; capacity: number; base_price: number; room_count: number | null }
export interface WizardPackage {
  id: string; name: string; enabled: boolean; guest_count: number; primary_room_type_id: string | null;
  tier_prices: Record<string, { sale: number; original: number }> | null;
}
export interface WizardTemplate { id: string; template_name: string; room_type_id: string | null; default_package_id: string | null }
export interface WizardBasicInfo { name: string | null; address: string | null; phone: string | null; description: string | null; short_url_alias: string | null }
export interface FinalCheck { status: string; submitted_at: string | null; returned_at: string | null; return_reason: string | null }

export interface WizardData {
  isActive: boolean | null;
  basicInfo: WizardBasicInfo | null;
  roomTypes: WizardRoomType[];
  packages: WizardPackage[];
  templates: WizardTemplate[];
  finalCheck: FinalCheck | null;
}

const EMPTY: WizardData = { isActive: null, basicInfo: null, roomTypes: [], packages: [], templates: [], finalCheck: null };

/** 精靈畫面用的資料（只讀；寫入一律走 wizard_* 後端函式） */
export function useWizardData(accommodationId: string | null | undefined) {
  const [data, setData] = useState<WizardData>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accommodationId) return;
    setLoading(true);
    const [acc, rts, pkgs, tpls, fc] = await Promise.all([
      supabase.from("accommodation_info").select("is_active, name, address, phone, description, short_url_alias").eq("id", accommodationId).maybeSingle(),
      supabase.from("room_types").select("id, name, capacity, base_price, room_count").eq("accommodation_id", accommodationId).order("display_order"),
      supabase.from("accommodation_packages").select("id, name, enabled, guest_count, primary_room_type_id, tier_prices").eq("accommodation_id", accommodationId).order("display_order"),
      supabase.from("pricing_templates").select("id, template_name, room_type_id, default_package_id").eq("accommodation_id", accommodationId),
      (supabase.from("accommodation_onboarding_steps") as any)
        .select("status, submitted_at, returned_at, return_reason")
        .eq("accommodation_id", accommodationId).eq("step_key", "final_check").maybeSingle(),
    ]);
    setData({
      isActive: (acc.data as { is_active: boolean } | null)?.is_active ?? null,
      basicInfo: (acc.data as WizardBasicInfo | null) ?? null,
      roomTypes: (rts.data ?? []) as WizardRoomType[],
      packages: (pkgs.data ?? []) as unknown as WizardPackage[],
      templates: (tpls.data ?? []) as WizardTemplate[],
      finalCheck: (fc.data as FinalCheck | null) ?? null,
    });
    setLoading(false);
  }, [accommodationId]);

  useEffect(() => { void load(); }, [load]);

  return { ...data, loading, reload: load, locked: data.finalCheck?.status === "submitted" };
}
