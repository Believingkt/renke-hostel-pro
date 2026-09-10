/**
 * 建置時產生 dist/sitemap.xml。
 *
 * 與 vite-plugin-seo-prerender 相同，連線設定由 vite.config.ts 的 loadEnv() 傳入，
 * 不依賴獨立行程的 process.env（舊的 prebuild 腳本就是因此撈不到資料）。
 *
 * 守則：撈不到資料時「不寫檔」，讓 dist 沿用 public/sitemap.xml 作為保底，
 * 避免把完整清單靜默覆蓋成只剩一筆。
 */
import type { Plugin } from "vite";
import { writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://booking.lakeze.com";
const BASE_OG_IMAGE = `${BASE_URL}/og-image-1200x630.png`;

interface SitemapEntry {
  loc: string;
  changefreq?: string;
  priority?: string;
  image?: { loc: string; title?: string; caption?: string };
}

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

const esc = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const clamp = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function fetchAccommodations(
  url: string,
  key: string,
): Promise<{ rows: AccRow[]; skip?: string }> {
  if (!url || !key) return { rows: [], skip: "缺少資料庫連線設定" };
  try {
    const res = await fetch(
      `${url}/rest/v1/accommodation_info?select=id,name,description,short_url_alias,custom_domain,seo_title,seo_description,og_title,og_description,og_image_url&is_active=eq.true`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return { rows: [], skip: `資料庫回應 ${res.status}` };
    const rows = (await res.json()) as AccRow[];
    if (!Array.isArray(rows) || rows.length === 0) return { rows: [], skip: "館別清單為空" };
    return { rows };
  } catch (e) {
    return { rows: [], skip: `讀取失敗：${(e as Error).message}` };
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

export function buildSitemap(accommodations: AccRow[]): string {
  const entries: SitemapEntry[] = [
    { loc: `${BASE_URL}/booking`, changefreq: "daily", priority: "1.0" },
  ];

  for (const a of accommodations) {
    if (!a.id) continue;
    const title = clamp((a.seo_title || a.og_title || a.name || "人客多線上訂房系統").trim(), 70);
    const caption = clamp(
      (a.seo_description || a.og_description || a.description || "官方網站與線上訂房系統")
        .replace(/\s+/g, " ")
        .trim(),
      200,
    );
    const alias = a.short_url_alias?.trim().replace(/^\/+|\/+$/g, "");
    const loc =
      alias && /^[a-z0-9-_]+$/i.test(alias)
        ? `${BASE_URL}/${alias}`
        : `${BASE_URL}/booking/villa/${a.id}`;

    entries.push({
      loc,
      changefreq: "weekly",
      priority: "0.8",
      image: { loc: (a.og_image_url || "").trim() || BASE_OG_IMAGE, title, caption },
    });
  }

  return render(entries);
}

export function sitemap(opts: { url: string; key: string; outDir?: string }): Plugin {
  return {
    name: "generate-sitemap",
    apply: "build",
    async closeBundle() {
      const outDir = resolve(opts.outDir || "dist");
      if (!existsSync(outDir)) {
        console.warn("[sitemap] 略過：找不到輸出目錄");
        return;
      }
      const { rows, skip } = await fetchAccommodations(opts.url, opts.key);
      if (skip) {
        console.warn(`[sitemap] 略過：${skip}（沿用 public/sitemap.xml）`);
        return;
      }
      writeFileSync(resolve(outDir, "sitemap.xml"), buildSitemap(rows));
      console.log(`[sitemap] 已產生 ${rows.length + 1} 筆網址`);
    },
  };
}
