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
  /** 各館別 SEO／og 預覽資料（以圖片延伸標籤帶入） */
  image?: { loc: string; title?: string; caption?: string };
}

const BASE_OG_IMAGE = `${BASE_URL}/og-image-1200x630.png`;

const esc = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const clamp = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

interface AccRow {
  id: string;
  name: string | null;
  description: string | null;
  short_url_alias: string | null;
  custom_domain: string | null;
  seo_title: string | null;
  seo_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
}

async function fetchAccommodations(): Promise<AccRow[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/accommodation_info?select=id,name,description,short_url_alias,custom_domain,seo_title,seo_description,og_title,og_description,og_image_url&is_active=eq.true`,
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
      e.image
        ? [
            `    <image:image>`,
            `      <image:loc>${esc(e.image.loc)}</image:loc>`,
            e.image.title ? `      <image:title>${esc(e.image.title)}</image:title>` : null,
            e.image.caption ? `      <image:caption>${esc(e.image.caption)}</image:caption>` : null,
            `    </image:image>`,
          ]
            .filter(Boolean)
            .join("\n")
        : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`,
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
  // sitemap 只列 canonical 網址（一律主網域），自訂網域網址不再列入。
  const origin = BASE_URL;
  const title = clamp(
    (a.seo_title || a.og_title || a.name || "人客多線上訂房系統").trim(),
    70,
  );
  const caption = clamp(
    (a.seo_description || a.og_description || a.description || "官方網站與線上訂房系統")
      .replace(/\s+/g, " ")
      .trim(),
    200,
  );

  entries.push({
    loc: (() => {
      const alias = a.short_url_alias?.trim().replace(/^\/+|\/+$/g, "");
      return alias && /^[a-z0-9-_]+$/i.test(alias)
        ? `${origin}/${alias}`
        : `${origin}/booking/villa/${a.id}`;
    })(),
    changefreq: "daily",
    priority: "0.9",
    image: {
      loc: (a.og_image_url || "").trim() || BASE_OG_IMAGE,
      title,
      caption,
    },
  });
}

writeFileSync(resolve("public/sitemap.xml"), render(entries));
console.log(`sitemap.xml written (${entries.length} entries)`);
