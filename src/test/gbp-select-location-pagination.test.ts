/**
 * Phase 2C.1 — select-location pagination fix.
 *
 * Source-contract checks plus a behavioural simulation of the exact
 * findAccount / findLocation loop shape (pageSize + nextPageToken + page cap,
 * fail-closed when the cap is hit while more pages remain).
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(
  resolve(process.cwd(), "supabase/functions/google-business-profile-select-location/index.ts"),
  "utf8",
);

const MAX_PAGES = 10;

type Lookup =
  | { status: "found"; item: any }
  | { status: "not_found" }
  | { status: "limit_reached" };

/** Mirrors the loop implemented in the edge function. */
async function scan(
  fetchPage: (token?: string) => Promise<{ items?: any[]; nextPageToken?: string }>,
  match: (i: any) => boolean,
): Promise<Lookup> {
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const json = await fetchPage(pageToken);
    const hit = (json.items ?? []).find(match);
    if (hit) return { status: "found", item: hit };
    pageToken = json.nextPageToken;
    pages += 1;
  } while (pageToken && pages < MAX_PAGES);
  if (pageToken) return { status: "limit_reached" };
  return { status: "not_found" };
}

const pager = (pages: { items: any[]; nextPageToken?: string }[]) => {
  let i = 0;
  return vi.fn(async () => pages[Math.min(i++, pages.length - 1)]);
};

describe("select-location source contract", () => {
  it("uses the list-accounts pagination contract (pageSize 20 + pageToken)", () => {
    expect(src).toContain('url.searchParams.set("pageSize", "20")');
    expect(src).toContain('if (pageToken) url.searchParams.set("pageToken", pageToken)');
    expect(src).toContain("pageToken = json.nextPageToken;");
    expect(src).toContain("} while (pageToken && pages < MAX_PAGES);");
  });

  it("uses the list-locations pagination contract (pageSize 100)", () => {
    expect(src).toContain('url.searchParams.set("pageSize", "100")');
    expect(src).toContain("const MAX_PAGES = 10;");
  });

  it("fails closed with explicit lookup-limit errors", () => {
    expect(src).toContain('return jsonResp({ error: "GBP_ACCOUNT_LOOKUP_LIMIT_REACHED" }, 409);');
    expect(src).toContain('return jsonResp({ error: "GBP_LOCATION_LOOKUP_LIMIT_REACHED" }, 409);');
    expect(src).toContain('if (pageToken) return { status: "limit_reached" };');
  });

  it("keeps the ordered security contract: authz -> token -> account -> location -> upsert", () => {
    const authIdx = src.indexOf("authorizeAccommodation(req, accommodationId)");
    const tokenIdx = src.indexOf("getGoogleBusinessProfileAccessToken(");
    const accIdx = src.indexOf("await findAccount(");
    const locIdx = src.indexOf("await findLocation(");
    const upsertIdx = src.indexOf(".upsert(");
    expect(authIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(tokenIdx);
    expect(tokenIdx).toBeLessThan(accIdx);
    expect(accIdx).toBeLessThan(locIdx);
    expect(locIdx).toBeLessThan(upsertIdx);
  });

  it("token stays tenant-scoped and never client-selectable", () => {
    expect(src).toContain("getGoogleBusinessProfileAccessToken(\n      admin,\n      accommodationId,\n    )");
    expect(src).not.toMatch(/body\.(secretName|vault|tokenKey|refreshToken)/);
  });

  it("CONNECTED is written only after both lookups succeed", () => {
    expect((src.match(/CONNECTED/g) ?? [])).toHaveLength(1);
    expect(src.indexOf('connection_status: "CONNECTED"')).toBeGreaterThan(
      src.indexOf("GBP_LOCATION_NOT_ACCESSIBLE"),
    );
  });
});

describe("account lookup behaviour", () => {
  it("found on page 1 -> PASS", async () => {
    const f = pager([{ items: [{ name: "accounts/1" }] }]);
    const r = await scan(f, (a) => a.name === "accounts/1");
    expect(r.status).toBe("found");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("found on page 2 -> PASS", async () => {
    const f = pager([
      { items: [{ name: "accounts/9" }], nextPageToken: "t2" },
      { items: [{ name: "accounts/1" }] },
    ]);
    const r = await scan(f, (a) => a.name === "accounts/1");
    expect(r.status).toBe("found");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("absent across all pages -> DENY (not_found)", async () => {
    const f = pager([
      { items: [{ name: "accounts/9" }], nextPageToken: "t2" },
      { items: [{ name: "accounts/8" }] },
    ]);
    expect((await scan(f, (a) => a.name === "accounts/1")).status).toBe("not_found");
  });

  it("page cap reached with more pages pending -> FAIL CLOSED", async () => {
    const f = pager([{ items: [{ name: "accounts/9" }], nextPageToken: "more" }]);
    const r = await scan(f, (a) => a.name === "accounts/1");
    expect(r.status).toBe("limit_reached");
    expect(f).toHaveBeenCalledTimes(MAX_PAGES);
  });
});

describe("location lookup behaviour", () => {
  const target = "accounts/1/locations/5";

  it("found on page 1 -> PASS", async () => {
    const f = pager([{ items: [{ name: target, title: "A" }] }]);
    const r = await scan(f, (l) => l.name === target);
    expect(r.status).toBe("found");
  });

  it("found on page 2 -> PASS", async () => {
    const f = pager([
      { items: [{ name: "accounts/1/locations/1" }], nextPageToken: "t2" },
      { items: [{ name: target, title: "B" }] },
    ]);
    const r = await scan(f, (l) => l.name === target);
    expect(r.status).toBe("found");
    expect((r as any).item.title).toBe("B");
  });

  it("absent across all pages -> DENY (not_found)", async () => {
    const f = pager([{ items: [{ name: "accounts/1/locations/1" }] }]);
    expect((await scan(f, (l) => l.name === target)).status).toBe("not_found");
  });

  it("page cap reached -> FAIL CLOSED", async () => {
    const f = pager([{ items: [{ name: "x" }], nextPageToken: "more" }]);
    expect((await scan(f, (l) => l.name === target)).status).toBe("limit_reached");
  });

  it("cross-account location is never matched", async () => {
    const f = pager([{ items: [{ name: "accounts/2/locations/5" }] }]);
    expect((await scan(f, (l) => l.name === target)).status).toBe("not_found");
  });
});
