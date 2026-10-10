// 館別周邊行程範圍：該館＋同 region_1 的館別（trip-recommend 與 LINE 管家共用）
// deno-lint-ignore no-explicit-any
type SupabaseClient = any; // 呼叫端 supabase-js 版本不一，僅用查詢 API

export async function nearbyAccommodationIds(sb: SupabaseClient, accId: string): Promise<string[]> {
  const { data: acc } = await sb.from("accommodation_info").select("id, region_1").eq("id", accId).maybeSingle();
  if (!acc) return [accId];
  if (!acc.region_1) return [acc.id];
  const { data: same } = await sb.from("accommodation_info").select("id").eq("region_1", acc.region_1);
  return [...new Set([acc.id, ...(same || []).map((a: { id: string }) => a.id)])];
}

export async function countNearbyTripProducts(sb: SupabaseClient, accId: string): Promise<number> {
  const ids = await nearbyAccommodationIds(sb, accId);
  const { count } = await sb
    .from("trip_products")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .in("accommodation_id", ids);
  return count ?? 0;
}
