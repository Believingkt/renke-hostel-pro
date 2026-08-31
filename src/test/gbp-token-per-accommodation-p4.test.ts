// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const sharedPath = "supabase/functions/_shared/gbp.ts";
const shared = readFileSync(sharedPath, "utf8");

/** Strip comments so contract assertions test executable code, not prose. */
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const sharedCode = codeOnly(shared);

/** Body of getGoogleBusinessProfileAccessToken only (comment-stripped). */
const helperBody = (() => {
  const start = sharedCode.indexOf("export async function getGoogleBusinessProfileAccessToken");
  expect(start).toBeGreaterThan(-1);
  return sharedCode.slice(start);
})();

/* ── Load the Deno module in Node by stubbing its remote/Deno-only imports ── */
let mod: any;
beforeAll(async () => {
  const src = shared
    .replace(/^import .*esm\.sh.*$/m, "const createClient = () => ({});")
    .replace(/^import \{[\s\S]*?\} from "\.\/authz\.ts";$/m, "const resolveCaller:any=null, canEditModule:any=null;")
    .replace(/^\s*type AuthContext.*$/m, "")
    .replace(/: AuthContext/g, ": any")
    .replace(/AuthContext/g, "any");
  const js = transformSync(src, { loader: "ts", format: "cjs", target: "es2022" }).code;
  const exports: any = {};
  // deno-lint-ignore no-explicit-any
  new Function("exports", "require", "Deno", js)(exports, () => ({}), {
    env: { get: () => "http://localhost" },
  });
  mod = exports;
});

type Row = {
  oauth_client_id: string | null;
  client_secret_configured: boolean;
  connection_status: string;
};

function makeAdmin(row: Row | null, vault: Record<string, string>) {
  const updates: any[] = [];
  const vaultWrites: any[] = [];
  const admin: any = {
    updates,
    vaultWrites,
    vault,
    from() {
      const q: any = {
        select: () => q,
        eq: (_c: string, v: string) => {
          q._id = v;
          return q;
        },
        maybeSingle: async () => ({ data: row }),
        update(patch: any) {
          updates.push(patch);
          return { eq: async () => ({ error: null }) };
        },
      };
      return q;
    },
    async rpc(fn: string, args: any) {
      if (fn === "gbp_vault_get") {
        return { data: vault[args.p_name] ?? null, error: null };
      }
      if (fn === "gbp_vault_set") {
        vaultWrites.push(args);
        vault[args.p_name] = args.p_value;
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
  };
  return admin;
}

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const connectedRow = (clientId: string): Row => ({
  oauth_client_id: clientId,
  client_secret_configured: true,
  connection_status: "CONNECTED",
});

function vaultFor(id: string, secret: string, refresh: string) {
  return {
    [`google_business_profile_oauth_client_secret_${id}`]: secret,
    [`google_business_profile_refresh_token_${id}`]: refresh,
  };
}

function mockFetchOk(body: any, capture: URLSearchParams[]) {
  return vi.fn(async (_url: string, init: any) => {
    capture.push(new URLSearchParams(init.body.toString()));
    return { ok: true, status: 200, json: async () => body } as any;
  });
}

function mockFetchErr(status: number, body: any, capture: URLSearchParams[] = []) {
  return vi.fn(async (_url: string, init: any) => {
    capture.push(new URLSearchParams(init.body.toString()));
    return { ok: false, status, json: async () => body } as any;
  });
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toMatchObject({ code });
}

/* ─────────────────────────── source contract ─────────────────────────── */

describe("P4｜helper 無 global fallback", () => {
  it("getGoogleBusinessProfileAccessToken 不引用 global config / secret", () => {
    expect(helperBody).not.toContain("getPlatformConfig(");
    expect(helperBody).not.toContain("PLATFORM_SECRET_NAME");
    expect(helperBody).not.toContain("google_business_profile_platform_config");
    expect(helperBody).not.toContain("GBP_PLATFORM_NOT_CONFIGURED");
  });

  it("credential 皆由 accommodationId server-side derive", () => {
    expect(helperBody).toContain("accommodationClientSecretName(accommodationId)");
    expect(helperBody).toContain("refreshTokenSecretName(accommodationId)");
    expect(helperBody).toContain("accommodation_google_business_profile");
  });

  it("不以 application_status 作為 refresh gate", () => {
    expect(helperBody).not.toContain("application_status");
  });

  it("access token 不寫 DB / Vault / log", () => {
    expect(helperBody).not.toContain("console.log");
    expect(helperBody).not.toMatch(/access_token:\s/);
    expect(helperBody).toContain("return json.access_token as string;");
  });

  it("direct consumers 不自行讀 global config", () => {
    for (
      const f of [
        "google-business-profile-list-accounts",
        "google-business-profile-list-locations",
        "google-business-profile-select-location",
        "fetch-google-business-profile-reviews",
      ]
    ) {
      const src = codeOnly(readFileSync(`supabase/functions/${f}/index.ts`, "utf8"));
      expect(src).not.toContain("getPlatformConfig");
      expect(src).not.toContain("PLATFORM_SECRET_NAME");
      expect(src).not.toContain("google_business_profile_platform_config");
      expect(src).toContain("getGoogleBusinessProfileAccessToken(");
    }
  });
});

/* ─────────────────────────── behaviour ─────────────────────────── */

describe("P4｜tenant isolation", () => {
  it("A 館用 A/A/A，B 館用 B/B/B，不交叉", async () => {
    const capA: URLSearchParams[] = [];
    const adminA = makeAdmin(connectedRow("client-A"), vaultFor(A, "secret-A", "refresh-A"));
    globalThis.fetch = mockFetchOk({ access_token: "at-A" }, capA) as any;
    await expect(mod.getGoogleBusinessProfileAccessToken(adminA, A)).resolves.toBe("at-A");
    expect(capA[0].get("client_id")).toBe("client-A");
    expect(capA[0].get("client_secret")).toBe("secret-A");
    expect(capA[0].get("refresh_token")).toBe("refresh-A");
    expect(capA[0].get("grant_type")).toBe("refresh_token");

    const capB: URLSearchParams[] = [];
    const adminB = makeAdmin(connectedRow("client-B"), vaultFor(B, "secret-B", "refresh-B"));
    globalThis.fetch = mockFetchOk({ access_token: "at-B" }, capB) as any;
    await expect(mod.getGoogleBusinessProfileAccessToken(adminB, B)).resolves.toBe("at-B");
    expect(capB[0].get("client_id")).toBe("client-B");
    expect(capB[0].get("client_secret")).toBe("secret-B");
    expect(capB[0].get("refresh_token")).toBe("refresh-B");
  });
});

describe("P4｜fail closed", () => {
  it("client_secret_configured=false 於讀 Vault / 呼叫 Google 前即失敗", async () => {
    const admin = makeAdmin(
      { ...connectedRow("client-A"), client_secret_configured: false },
      vaultFor(A, "secret-A", "refresh-A"),
    );
    const f = vi.fn();
    globalThis.fetch = f as any;
    await expectCode(
      mod.getGoogleBusinessProfileAccessToken(admin, A),
      "GBP_ACCOMMODATION_NOT_CONFIGURED",
    );
    expect(f).not.toHaveBeenCalled();
  });

  it("Client Secret 不在 Vault → GBP_CLIENT_SECRET_MISSING", async () => {
    const admin = makeAdmin(connectedRow("client-A"), {
      [`google_business_profile_refresh_token_${A}`]: "refresh-A",
    });
    const f = vi.fn();
    globalThis.fetch = f as any;
    await expectCode(
      mod.getGoogleBusinessProfileAccessToken(admin, A),
      "GBP_CLIENT_SECRET_MISSING",
    );
    expect(f).not.toHaveBeenCalled();
  });

  it("Refresh Token 不在 Vault → GBP_NOT_CONNECTED", async () => {
    const admin = makeAdmin(connectedRow("client-A"), {
      [`google_business_profile_oauth_client_secret_${A}`]: "secret-A",
    });
    const f = vi.fn();
    globalThis.fetch = f as any;
    await expectCode(mod.getGoogleBusinessProfileAccessToken(admin, A), "GBP_NOT_CONNECTED");
    expect(f).not.toHaveBeenCalled();
  });

  it("無 credential row → GBP_NOT_CONFIGURED", async () => {
    const admin = makeAdmin(null, {});
    await expectCode(mod.getGoogleBusinessProfileAccessToken(admin, A), "GBP_NOT_CONFIGURED");
  });
});

describe("P4｜connection state", () => {
  it("READY_FOR_OAUTH 與 CONNECTED 皆可取 token", async () => {
    for (const status of ["READY_FOR_OAUTH", "CONNECTED"]) {
      const cap: URLSearchParams[] = [];
      const admin = makeAdmin(
        { ...connectedRow("client-A"), connection_status: status },
        vaultFor(A, "secret-A", "refresh-A"),
      );
      globalThis.fetch = mockFetchOk({ access_token: "at" }, cap) as any;
      await expect(mod.getGoogleBusinessProfileAccessToken(admin, A)).resolves.toBe("at");
    }
  });

  it("TOKEN_EXPIRED / NOT_CONFIGURED / ERROR fail closed", async () => {
    const cases: Array<[string, string]> = [
      ["TOKEN_EXPIRED", "GBP_TOKEN_EXPIRED"],
      ["NOT_CONFIGURED", "GBP_NOT_CONNECTED"],
      ["ERROR", "GBP_NOT_CONNECTED"],
    ];
    for (const [status, code] of cases) {
      const admin = makeAdmin(
        { ...connectedRow("client-A"), connection_status: status },
        vaultFor(A, "secret-A", "refresh-A"),
      );
      const f = vi.fn();
      globalThis.fetch = f as any;
      await expectCode(mod.getGoogleBusinessProfileAccessToken(admin, A), code);
      expect(f).not.toHaveBeenCalled();
    }
  });
});

describe("P4｜Google error handling", () => {
  it("invalid_grant → TOKEN_EXPIRED", async () => {
    const admin = makeAdmin(connectedRow("client-A"), vaultFor(A, "secret-A", "refresh-A"));
    globalThis.fetch = mockFetchErr(400, { error: "invalid_grant" }) as any;
    await expectCode(mod.getGoogleBusinessProfileAccessToken(admin, A), "GBP_TOKEN_EXPIRED");
    expect(admin.updates).toEqual([{ connection_status: "TOKEN_EXPIRED" }]);
  });

  it("429 / 500 / 503 不得標記 TOKEN_EXPIRED", async () => {
    for (const status of [429, 500, 503]) {
      const admin = makeAdmin(connectedRow("client-A"), vaultFor(A, "secret-A", "refresh-A"));
      globalThis.fetch = mockFetchErr(status, { error: "invalid_grant" }) as any;
      await expectCode(
        mod.getGoogleBusinessProfileAccessToken(admin, A),
        "GBP_TOKEN_REFRESH_FAILED",
      );
      expect(admin.updates).toEqual([]);
    }
  });

  it("network timeout 不得標記 TOKEN_EXPIRED", async () => {
    const admin = makeAdmin(connectedRow("client-A"), vaultFor(A, "secret-A", "refresh-A"));
    globalThis.fetch = vi.fn(async () => {
      throw new Error("timeout");
    }) as any;
    await expectCode(
      mod.getGoogleBusinessProfileAccessToken(admin, A),
      "GBP_TOKEN_REFRESH_FAILED",
    );
    expect(admin.updates).toEqual([]);
  });
});

describe("P4｜refresh token rotation", () => {
  it("回應無 refresh_token → 保留舊值", async () => {
    const vault = vaultFor(A, "secret-A", "refresh-A");
    const admin = makeAdmin(connectedRow("client-A"), vault);
    globalThis.fetch = mockFetchOk({ access_token: "at" }, []) as any;
    await mod.getGoogleBusinessProfileAccessToken(admin, A);
    expect(admin.vaultWrites).toEqual([]);
    expect(vault[`google_business_profile_refresh_token_${A}`]).toBe("refresh-A");
  });

  it("回應含新 refresh_token → 覆寫同館 key", async () => {
    const vault = vaultFor(A, "secret-A", "refresh-A");
    const admin = makeAdmin(connectedRow("client-A"), vault);
    globalThis.fetch = mockFetchOk(
      { access_token: "at", refresh_token: "refresh-A2" },
      [],
    ) as any;
    await mod.getGoogleBusinessProfileAccessToken(admin, A);
    expect(admin.vaultWrites).toEqual([
      { p_name: `google_business_profile_refresh_token_${A}`, p_value: "refresh-A2" },
    ]);
  });

  it("access token 不寫入 Vault / DB", async () => {
    const admin = makeAdmin(connectedRow("client-A"), vaultFor(A, "secret-A", "refresh-A"));
    globalThis.fetch = mockFetchOk({ access_token: "at-secret" }, []) as any;
    await mod.getGoogleBusinessProfileAccessToken(admin, A);
    expect(JSON.stringify(admin.vaultWrites)).not.toContain("at-secret");
    expect(JSON.stringify(admin.updates)).not.toContain("at-secret");
  });
});
