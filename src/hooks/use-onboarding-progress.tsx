import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ONBOARDING_WINDOW_DAYS,
  evaluateSteps,
  progressOf,
  type OnboardingSource,
  type StepResult,
} from "@/lib/onboarding/steps";

/** 台北時區今日 yyyy-MM-dd */
function taipeiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

function addDays(day: string, n: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
}

interface State {
  steps: StepResult[];
  done: number;
  total: number;
  loading: boolean;
}

/**
 * 上架引導完成度。只讀既有表 + accommodation_onboarding_steps，
 * 不寫入任何訂房核心資料表。
 */
export function useOnboardingProgress(accommodationId: string | null | undefined) {
  const [state, setState] = useState<State>({ steps: [], done: 0, total: 0, loading: true });

  const load = useCallback(async () => {
    if (!accommodationId) {
      setState({ steps: [], done: 0, total: 0, loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const today = taipeiToday();
    const windowEnd = addDays(today, ONBOARDING_WINDOW_DAYS - 1);

    const [infoRes, aboutRes, photoRes, facRes, rtRes, tplRes, pkgRes, bsRes, notifyRes, confirmRes] =
      await Promise.all([
        supabase.from("accommodation_info").select("name, address, phone, description").eq("id", accommodationId).maybeSingle(),
        supabase.from("about_section").select("section_title, section_description").eq("accommodation_id", accommodationId).maybeSingle(),
        supabase.from("accommodation_photos").select("id", { count: "exact", head: true }).eq("accommodation_id", accommodationId),
        supabase.from("accommodation_facilities").select("is_available").eq("accommodation_id", accommodationId),
        supabase.from("room_types").select("id, name, capacity").eq("accommodation_id", accommodationId),
        supabase.from("pricing_templates").select("room_type_ids").eq("accommodation_id", accommodationId),
        supabase.from("accommodation_packages").select("id, enabled").eq("accommodation_id", accommodationId),
        supabase
          .from("booking_settings")
          .select("payment_methods, deposit_percentage, security_deposit_amount, free_cancel_days")
          .eq("accommodation_id", accommodationId)
          .maybeSingle(),
        supabase
          .from("accommodation_notification_settings")
          .select("booking_confirmation_emails")
          .eq("accommodation_id", accommodationId)
          .maybeSingle(),
        supabase.from("accommodation_onboarding_steps").select("step_key, status").eq("accommodation_id", accommodationId),
      ]);

    const roomTypes = (rtRes.data ?? []) as Array<{ id: string; name: string | null; capacity: number | null }>;
    const roomTypeIds = roomTypes.map((r) => r.id);

    const [photoByRtRes, invRes, priceRes] = await Promise.all([
      roomTypeIds.length
        ? supabase.from("room_photos").select("room_type_id").in("room_type_id", roomTypeIds)
        : Promise.resolve({ data: [] as any[] }),
      roomTypeIds.length
        ? supabase
            .from("room_inventory_pricing")
            .select("date, available_rooms")
            .in("room_type_id", roomTypeIds)
            .gte("date", today)
            .lte("date", windowEnd)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from("package_date_prices")
        .select("date, package_id, sale_price, is_available")
        .eq("accommodation_id", accommodationId)
        .gte("date", today)
        .lte("date", windowEnd),
    ]);

    const src: OnboardingSource = {
      today,
      info: (infoRes.data as any) ?? null,
      about: (aboutRes.data as any) ?? null,
      photoCount: photoRes.count ?? 0,
      facilities: (facRes.data ?? []) as any[],
      roomTypes,
      roomPhotoRoomTypeIds: ((photoByRtRes.data ?? []) as any[]).map((r) => r.room_type_id),
      pricingTemplates: (tplRes.data ?? []) as any[],
      inventoryRows: (invRes.data ?? []) as any[],
      packages: (pkgRes.data ?? []) as any[],
      packagePriceRows: (priceRes.data ?? []) as any[],
      bookingSettings: (bsRes.data as any) ?? null,
      notificationEmails: ((notifyRes.data as any)?.booking_confirmation_emails as string[] | null) ?? [],
      confirmations: Object.fromEntries(
        ((confirmRes.data ?? []) as any[]).map((r) => [r.step_key as string, r.status as string]),
      ),
    };

    const steps = evaluateSteps(src);
    const { done, total } = progressOf(steps);
    setState({ steps, done, total, loading: false });
  }, [accommodationId]);

  useEffect(() => {
    load();
  }, [load]);

  /** 寫入業主確認狀態（僅 accommodation_onboarding_steps） */
  const confirmStep = useCallback(
    async (stepKey: string) => {
      if (!accommodationId) return { error: "缺少館別" as const };
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("accommodation_onboarding_steps").upsert(
        {
          accommodation_id: accommodationId,
          step_key: stepKey,
          status: "confirmed",
          confirmed_by: userData?.user?.id ?? null,
          confirmed_at: new Date().toISOString(),
        },
        { onConflict: "accommodation_id,step_key" },
      );
      if (!error) await load();
      return { error: error?.message ?? null };
    },
    [accommodationId, load],
  );

  return { ...state, reload: load, confirmStep };
}
