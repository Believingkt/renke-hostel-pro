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
  Array<{ short_url_alias: string | null; custom_domain: string | null }>
> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/accommodation_info?select=short_url_alias,custom_domain&is_active=eq.true`,
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

for (const a of accommodations) {
  const domain = a.custom_domain?.trim();
  if (domain) {
    entries.push({
      loc: `https://${domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}/`,
      changefreq: "daily",
      priority: "0.9",
    });
    continue;
  }
  const alias = a.short_url_alias?.trim();
  if (alias) {
    entries.push({ loc: `${BASE_URL}/${alias}`, changefreq: "daily", priority: "0.9" });
  }
}

writeFileSync(resolve("public/sitemap.xml"), render(entries));
console.log(`sitemap.xml written (${entries.length} entries)`);
