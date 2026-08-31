import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const edge = readFileSync(
  "supabase/functions/save-google-business-profile-accommodation-secret/index.ts",
  "utf8",
);
const ui = readFileSync(
  "src/components/website-content/GoogleBusinessProfileSettings.tsx",
  "utf8",
);

describe("GBP P2｜每館 Client Secret Vault", () => {
  it("Edge：授權在讀取 secret 之前完成", () => {
    expect(edge.indexOf("resolveCaller")).toBeLessThan(
      edge.indexOf("body.client_secret"),
    );
    expect(edge.indexOf("isAllowedSecretManager")).toBeLessThan(
      edge.indexOf("body.client_secret"),
    );
  });

  it("Edge：不得使用寬鬆的 is_admin_or_super，僅 super_admin / 本館 hotel_admin", () => {
    expect(edge).not.toContain("is_admin_or_super");
    expect(edge).toContain('.in("role", ["super_admin", "hotel_admin"])');
    expect(edge).toContain('.eq("accommodation_id", accommodationId)');
  });

  it("Edge：Vault 名稱由後端推導，前端不得指定", () => {
    expect(edge).not.toContain("body.secret_name");
    expect(edge).toContain("gbp_save_accommodation_oauth_client_secret");
  });

  it("Edge：回應與錯誤永不帶出 secret 內容", () => {
    expect(edge).not.toMatch(/console\.(log|error|warn)/);
    expect(edge).not.toMatch(/clientSecret\s*[,}]\s*\)/);
    expect(edge).toContain('jsonResp({ configured: true, accommodation_id: accommodationId })');
  });

  it("UI：Secret 為 password 欄位、成功後清空、不從 DB 回讀", () => {
    expect(ui).toContain('type="password"');
    expect(ui).toContain('setSecretInput("")');
    expect(ui).not.toContain("client_secret:" + " data");
    expect(ui).not.toMatch(/select\([^)]*client_secret[^_]/);
  });

  it("UI：Secret 只透過 Edge Function 送出，不寫入表格欄位", () => {
    expect(ui).toContain("save-google-business-profile-accommodation-secret");
    expect(ui).not.toMatch(/persist\(\{[^}]*client_secret/);
  });

  it("UI：Connect Google 仍為 DISABLED（P2 尚未開放）", () => {
    expect(ui).toContain("const OAUTH_RUNTIME_READY = false");
  });
});
