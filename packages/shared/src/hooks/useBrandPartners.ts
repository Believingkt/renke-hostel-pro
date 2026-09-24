import { useQuery } from "@tanstack/react-query";
import { supabase } from "@lakeze/shared/integrations/supabase/client";

export type BrandPartnerScope = "admin" | "team" | "hq" | "portal";

export interface BrandPartner {
  id: string;
  name: string;
  logo_url: string;
  label: string | null;
  link_url: string | null;
  scopes: string[];
  is_active: boolean;
  sort_order: number;
}

export const BRAND_PARTNER_SCOPES: { value: BrandPartnerScope; label: string }[] = [
  { value: "admin", label: "民宿後台" },
  { value: "team", label: "行銷團隊" },
  { value: "hq", label: "總部" },
  { value: "portal", label: "訂房前台" },
];

/** 取得指定顯示範圍的啟用中品牌夥伴（依排序） */
export function useBrandPartners(scope: BrandPartnerScope) {
  return useQuery({
    queryKey: ["brand-partners", scope],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<BrandPartner[]> => {
      const { data, error } = await supabase
        .from("platform_brand_partners")
        .select("*")
        .eq("is_active", true)
        .contains("scopes", [scope])
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BrandPartner[];
    },
  });
}

/** 總部管理用：取得全部品牌夥伴 */
export function useAllBrandPartners() {
  return useQuery({
    queryKey: ["brand-partners", "all"],
    queryFn: async (): Promise<BrandPartner[]> => {
      const { data, error } = await supabase
        .from("platform_brand_partners")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BrandPartner[];
    },
  });
}
