#!/usr/bin/env node
// 把 edge function 需要的 packages/shared 純函式原樣複製到 supabase/functions/_shared/vendor/（edge function 不 import supabase/ 以外的檔案）。
// 只做 REWRITES 列出的 import 改寫；其餘內容逐字相同。vitest（apps/booking/src/test/shared-vendor-sync.test.ts）會比對，不同步就失敗。
// 用法：node scripts/sync-shared-vendor.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const VENDOR_DIR = "supabase/functions/_shared/vendor";
/** [packages/shared 原檔, vendor 檔名] */
export const FILES = [
  ["packages/shared/src/lib/ownerSettlement.ts", "ownerSettlement.ts"],
  ["packages/shared/src/lib/groupBuyCaliber.ts", "groupBuyCaliber.ts"],
];
/** import 改寫規則（寫死）：bare npm 套件加 npm: 前綴與版本（版本同 packages/shared/package.json） */
export const REWRITES = [
  [/from "date-fns";/g, 'from "npm:date-fns@3.6.0";'],
];
export const header = (src) =>
  `// 由 ${src} 同步，勿手改；改原檔後跑 node scripts/sync-shared-vendor.mjs\n`;

export function transform(text) {
  return REWRITES.reduce((s, [re, to]) => s.replace(re, to), text);
}
export const vendorContent = (src) => header(src) + transform(readFileSync(resolve(ROOT, src), "utf8"));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(resolve(ROOT, VENDOR_DIR), { recursive: true });
  for (const [src, name] of FILES) {
    writeFileSync(resolve(ROOT, VENDOR_DIR, name), vendorContent(src));
    console.log(`synced ${src} -> ${VENDOR_DIR}/${name}`);
  }
}
