/**
 * 建置後預先產生「每間民宿專屬的 HTML 檔」，讓社群爬蟲與搜尋引擎
 * 在原始 HTML 就讀得到正確的標題／描述／預覽圖。
 *
 * 產出（build 後寫入 dist）：
 *   dist/booking/villa/{id}/index.html   ← canonical 網址
 *   dist/{alias}/index.html              ← 短網址（會在前端轉址，但爬蟲已能讀到 meta）
 *
 * 這些檔案內容 = 建置後的 dist/index.html，只替換 <head> 內的 SEO/OG 標籤，
 * 所以使用者實際造訪時 App 仍正常啟動（不是靜態快照，只是 head 不同）。
 *
 * 取不到資料（無網路／無金鑰）時直接略過，不影響建置。
 */
import type { Plugin } from "vite";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";

const BASE_URL = "https://booking.lakeze.com";
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image-1200x630.png`;

/** 與前端路由保留字相同，避免 alias 覆蓋既有頁面 */
const RESERVED = new Set([
  "admin","auth","hq","booking","member","api","assets","docs","privacy","data-deletion",
  "cart","search","kol","team","group-buy","payment","checkout","login","register","ai-booking",
]);

interface AccRow {
  id: string;
  name: string | null;
  description: string | null;
  short_url_alias: string | null;
  custom_domain: string | null;
  seo_title: string | null;
  seo_description: string | null;
  meta_keywords: string | null;
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

function originOf(acc: AccRow) {
  const domain = acc.custom_domain?.trim();
  return domain
    ? `https://${domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
    : BASE_URL;
}

async function fetchAccommodations(url: string, key: string): Promise<AccRow[]> {
  if (!url || !key) return [];
  try {
    const res = await fetch(
      `${url}/rest/v1/accommodation_info?select=id,name,description,short_url_alias,custom_domain,seo_title,seo_description,meta_keywords,og_title,og_description,og_image_url&is_active=eq.true`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return [];
    return (await res.json()) as AccRow[];
  } catch {
    return [];
  }
}

/** 移除 template 既有的 title / description / og / twitter 標籤 */
function stripHeadMeta(html: string) {
  return html
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta[^>]+name=["'](description|keywords)["'][^>]*>\s*/gi, "")
    .replace(/<meta[^>]+property=["']og:[^"']+["'][^>]*>\s*/gi, "")
    .replace(/<meta[^>]+name=["']twitter:[^"']+["'][^>]*>\s*/gi, "")
    .replace(/<link[^>]+rel=["']canonical["'][^>]*>\s*/gi, "");
}

function buildHead(acc: AccRow) {
  const name = (acc.name || "").trim();
  const title = clamp((acc.seo_title || acc.og_title || name || "人客多線上訂房系統").trim(), 70);
  const description = clamp(
    (acc.seo_description || acc.og_description || acc.description || "官方網站與線上訂房系統")
      .replace(/\s+/g, " ")
      .trim(),
    200,
  );
  const ogTitle = clamp((acc.og_title || acc.seo_title || name || title).trim(), 70);
  const ogDescription = clamp((acc.og_description || acc.seo_description || description).trim(), 200);
  const keywords = (acc.meta_keywords || "").trim();
  const image = (acc.og_image_url || "").trim() || DEFAULT_OG_IMAGE;
  const canonical = `${originOf(acc)}/booking/villa/${acc.id}`;

  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    keywords ? `<meta name="keywords" content="${esc(keywords)}" />` : null,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(name || "人客多線上訂房系統")}" />`,
    `<meta property="og:locale" content="zh_TW" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:title" content="${esc(ogTitle)}" />`,
    `<meta property="og:description" content="${esc(ogDescription)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:secure_url" content="${esc(image)}" />`,
    `<meta property="og:image:alt" content="${esc(ogTitle)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(ogTitle)}" />`,
    `<meta name="twitter:description" content="${esc(ogDescription)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ]
    .filter(Boolean)
    .join("\n    ");
}

export function seoPrerender(env: { url: string; key: string }): Plugin {
  return {
    name: "seo-prerender",
    apply: "build",
    async closeBundle() {
      const indexPath = resolve("dist/index.html");
      if (!existsSync(indexPath)) return;
      const accommodations = await fetchAccommodations(env.url, env.key);
      if (!accommodations.length) {
        console.log("[seo-prerender] 無民宿資料，略過");
        return;
      }
      const template = readFileSync(indexPath, "utf8");
      let count = 0;

      for (const acc of accommodations) {
        if (!acc?.id) continue;
        const html = stripHeadMeta(template).replace(
          /<\/head>/i,
          `  ${buildHead(acc)}\n  </head>`,
        );
        const paths = [`dist/booking/villa/${acc.id}/index.html`];
        const alias = acc.short_url_alias?.trim().replace(/^\/+|\/+$/g, "");
        if (alias && /^[a-z0-9-_]+$/i.test(alias) && !RESERVED.has(alias.toLowerCase())) {
          paths.push(`dist/${alias}/index.html`);
        }
        for (const p of paths) {
          const full = resolve(p);
          mkdirSync(dirname(full), { recursive: true });
          writeFileSync(full, html);
          count++;
        }
      }
      console.log(`[seo-prerender] 已產生 ${count} 個民宿專屬 HTML`);
    },
  };
}
