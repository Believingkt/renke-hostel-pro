// Recent-viewed accommodations, persisted in localStorage per browser.
// No PII — just accommodation snapshot to help the user jump back.

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

function read(): RecentView[] {
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

function write(list: RecentView[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* quota */
  }
}

export function getRecentViews(): RecentView[] {
  return read();
}

export function pushRecentView(v: RecentView) {
  if (!v.accommodation_id) return;
  const list = read().filter((x) => x.accommodation_id !== v.accommodation_id);
  list.unshift({ ...v, viewed_at: new Date().toISOString() });
  write(list);
}

export function removeRecentView(accommodation_id: string) {
  write(read().filter((x) => x.accommodation_id !== accommodation_id));
}

export function clearRecentViews() {
  write([]);
}
