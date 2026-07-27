// 於 `vite dev` / `vite build` 前執行（predev/prebuild），輸出 public/sitemap.xml。
// 只列出「新版包棟訂房頁」的正式網址，舊版 /booking/:accId 一律不列入。

import { writeFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://booking.lakeze.com";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";

interface SitemapEntry {
  loc: string;
  changefreq?: string;
  priority?: string;
}

async function fetchAccommodations(): Promise<
  Array<{ id: string; short_url_alias: string | null; custom_domain: string | null }>
> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/accommodation_info?select=id,short_url_alias,custom_domain&is_active=eq.true`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
    );
    if (!res.ok) return [];
    return (await res.json()) as any;
  } catch {
    return [];
  }
}

function render(entries: SitemapEntry[]) {
  const urls = entries.map((e) =>
    [
      `  <url>`,
      `    <loc>${e.loc}</loc>`,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

const accommodations = await fetchAccommodations();

const entries: SitemapEntry[] = [
  { loc: `${BASE_URL}/booking`, changefreq: "daily", priority: "1.0" },
];

// sitemap 只列出「與 canonical 完全一致」的最終網址（/booking/villa/{id}），
// 避免列出會再轉址的 alias / 網域根路徑。
for (const a of accommodations) {
  if (!a.id) continue;
  const domain = a.custom_domain?.trim();
  const origin = domain
    ? `https://${domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
    : BASE_URL;
  entries.push({
    loc: `${origin}/booking/villa/${a.id}`,
    changefreq: "daily",
    priority: "0.9",
  });
}

writeFileSync(resolve("public/sitemap.xml"), render(entries));
console.log(`sitemap.xml written (${entries.length} entries)`);
