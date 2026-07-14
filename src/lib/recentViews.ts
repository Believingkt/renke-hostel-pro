// Recent-viewed accommodations.
// Persists to localStorage (offline / anonymous) AND syncs to Supabase when logged-in
// so the list follows the user across devices.

import { supabase } from "@/integrations/supabase/client";

const KEY = "member_recent_views_v1";
const MAX = 20;

export interface RecentView {
  accommodation_id: string;
  name: string;
  region?: string | null;
  image_url?: string | null;
  path: string;
  viewed_at: string;
}

function readLocal(): RecentView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeLocal(list: RecentView[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* quota */
  }
}

async function getMemberId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("platform_members")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

/** Sync — merge remote + local, prefer newer viewed_at per accommodation. */
export async function fetchRecentViews(): Promise<RecentView[]> {
  const local = readLocal();
  const memberId = await getMemberId();
  if (!memberId) return local;

  const { data, error } = await (supabase as any)
    .from("member_recent_views")
    .select("accommodation_id, name, region, image_url, path, viewed_at")
    .eq("member_id", memberId)
    .order("viewed_at", { ascending: false })
    .limit(MAX);

  if (error || !data) return local;

  const map = new Map<string, RecentView>();
  for (const r of data as RecentView[]) map.set(r.accommodation_id, r);
  for (const r of local) {
    const ex = map.get(r.accommodation_id);
    if (!ex || new Date(r.viewed_at) > new Date(ex.viewed_at)) map.set(r.accommodation_id, r);
  }
  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(b.viewed_at).getTime() - new Date(a.viewed_at).getTime()
  );
  writeLocal(merged); // keep local mirror
  return merged.slice(0, MAX);
}

/** Sync version — reads localStorage only, for immediate paint. */
export function getRecentViews(): RecentView[] {
  return readLocal();
}

export async function pushRecentView(v: RecentView) {
  if (!v.accommodation_id) return;
  const entry: RecentView = { ...v, viewed_at: new Date().toISOString() };
  const list = readLocal().filter((x) => x.accommodation_id !== v.accommodation_id);
  list.unshift(entry);
  writeLocal(list);

  // fire-and-forget cloud sync
  try {
    const memberId = await getMemberId();
    if (!memberId) return;
    await (supabase as any)
      .from("member_recent_views")
      .upsert(
        {
          member_id: memberId,
          accommodation_id: entry.accommodation_id,
          name: entry.name,
          region: entry.region ?? null,
          image_url: entry.image_url ?? null,
          path: entry.path,
          viewed_at: entry.viewed_at,
        },
        { onConflict: "member_id,accommodation_id" }
      );
  } catch {
    /* offline */
  }
}

export async function removeRecentView(accommodation_id: string) {
  writeLocal(readLocal().filter((x) => x.accommodation_id !== accommodation_id));
  try {
    const memberId = await getMemberId();
    if (!memberId) return;
    await (supabase as any)
      .from("member_recent_views")
      .delete()
      .eq("member_id", memberId)
      .eq("accommodation_id", accommodation_id);
  } catch {
    /* ignore */
  }
}

export async function clearRecentViews() {
  writeLocal([]);
  try {
    const memberId = await getMemberId();
    if (!memberId) return;
    await (supabase as any).from("member_recent_views").delete().eq("member_id", memberId);
  } catch {
    /* ignore */
  }
}
