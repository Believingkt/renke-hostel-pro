import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PackageTier = "weekday" | "friday_sunday" | "weekend";

export interface PackageInclude {
  text: string;
  available: "yes" | "no" | "optional";
  price_note?: string;
}

export interface AccommodationPackage {
  id: string;
  accommodation_id: string;
  name: string;
  subtitle: string | null;
  guest_count: number;
  guest_count_max: number | null;
  original_price: number | null;
  sale_price: number;
  room_allocation: string | null;
  applicable_tiers: PackageTier[];
  tags: string[];
  includes: PackageInclude[];
  primary_room_type_id: string | null;
  display_order: number;
  enabled: boolean;
}

export function detectTierByDate(date: Date | null | undefined): PackageTier {
  const d = date ?? new Date();
  const day = d.getDay();
  if (day === 6) return "weekend";
  if (day === 5 || day === 0) return "friday_sunday";
  return "weekday";
}

export function useAccommodationPackages(accommodationId: string | null, opts?: { onlyEnabled?: boolean }) {
  const [packages, setPackages] = useState<AccommodationPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPackages = useCallback(async () => {
    if (!accommodationId) {
      setPackages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    let query = supabase
      .from("accommodation_packages")
      .select("*")
      .eq("accommodation_id", accommodationId)
      .order("display_order", { ascending: true })
      .order("guest_count", { ascending: true });
    if (opts?.onlyEnabled !== false) query = query.eq("enabled", true);
    const { data, error } = await query;
    if (error) {
      setError(error.message);
      setPackages([]);
    } else {
      setPackages((data || []) as any);
    }
    setLoading(false);
  }, [accommodationId, opts?.onlyEnabled]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  return { packages, loading, error, refetch: fetchPackages };
}
