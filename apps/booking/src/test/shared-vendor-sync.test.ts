import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { FILES, ROOT, VENDOR_DIR, vendorContent } from "../../../../scripts/sync-shared-vendor.mjs";

describe("supabase/functions/_shared/vendor 與 packages/shared 同步", () => {
  for (const [src, name] of FILES as Array<[string, string]>) {
    it(`${VENDOR_DIR}/${name} = ${src}（套用同步腳本改寫後逐字相同）`, () => {
      const actual = readFileSync(resolve(ROOT, VENDOR_DIR, name), "utf8");
      expect(actual === vendorContent(src), `${name} 與 ${src} 不同步，請執行 node scripts/sync-shared-vendor.mjs`).toBe(true);
    });
  }
  it("vendor 目錄沒有多餘檔案、vendor 檔不再 import 任何 bare 套件或 supabase/ 以外的路徑", () => {
    expect(readdirSync(resolve(ROOT, VENDOR_DIR)).sort()).toEqual((FILES as Array<[string, string]>).map(([, n]) => n).sort());
    for (const [, name] of FILES as Array<[string, string]>) {
      const imports = [...readFileSync(resolve(ROOT, VENDOR_DIR, name), "utf8").matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
      expect(imports.filter((p) => !p.startsWith("npm:") && !p.startsWith("./"))).toEqual([]);
    }
  });
});
