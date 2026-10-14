// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import {
  validateCreatePmsKeyInput,
  encodePmsKey,
  pmsKeyDisplayPrefix,
  READ_WRITE_CONFIRM_TOKEN as SERVER_TOKEN,
  PMS_KEY_PREFIX,
} from "../../../../supabase/functions/create-pms-api-key/logic";
import {
  READ_WRITE_CONFIRM_TOKEN,
  buildPmsSnippets,
  canDeleteKey,
  summarizePerformance,
  taipeiToday,
  formatRate,
} from "../utils/pmsApiKey";
import PmsApiKeys from "../../../../apps/booking/src/pages/admin/PmsApiKeys";
import { PmsKeyReveal } from "../../../../apps/booking/src/components/headquarters/pms-api-keys/PmsKeyReveal";

const root = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("validateCreatePmsKeyInput", () => {
  it("預設唯讀", () => {
    const r = validateCreatePmsKeyInput({ accommodation_id: A, name: " PMS " });
    expect(r).toEqual({ ok: true, value: { accommodationId: A, name: "PMS", extraAccommodationIds: [], isReadOnly: true } });
  });
  it("可讀寫需確認 token", () => {
    expect(validateCreatePmsKeyInput({ accommodation_id: A, name: "x", read_write: true })).toEqual({ ok: false, error: "read_write_not_confirmed" });
    const ok = validateCreatePmsKeyInput({ accommodation_id: A, name: "x", read_write: true, confirm_read_write: SERVER_TOKEN });
    expect(ok.ok && ok.value.isReadOnly).toBe(false);
  });
  it("多館金鑰不可讀寫", () => {
    const r = validateCreatePmsKeyInput({ accommodation_id: A, name: "x", extra_accommodation_ids: [B], read_write: true, confirm_read_write: SERVER_TOKEN });
    expect(r).toEqual({ ok: false, error: "multi_scope_must_be_read_only" });
  });
  it("範圍去重且排除主館", () => {
    const r = validateCreatePmsKeyInput({ accommodation_id: A, name: "x", extra_accommodation_ids: [B, B, A] });
    expect(r.ok && r.value.extraAccommodationIds).toEqual([B]);
  });
  it("拒絕非法輸入", () => {
    expect(validateCreatePmsKeyInput(null).ok).toBe(false);
    expect(validateCreatePmsKeyInput({ accommodation_id: "bad", name: "x" }).ok).toBe(false);
    expect(validateCreatePmsKeyInput({ accommodation_id: A, name: "" }).ok).toBe(false);
    expect(validateCreatePmsKeyInput({ accommodation_id: A, name: "a".repeat(101) }).ok).toBe(false);
    expect(validateCreatePmsKeyInput({ accommodation_id: A, name: "x", extra_accommodation_ids: ["nope"] }).ok).toBe(false);
    const loose = validateCreatePmsKeyInput({ accommodation_id: A, name: "x", read_write: "true" });
    expect(loose.ok && loose.value.isReadOnly).toBe(true);
  });
  it("前後端確認 token 一致", () => expect(READ_WRITE_CONFIRM_TOKEN).toBe(SERVER_TOKEN));
});

describe("金鑰格式", () => {
  it("32 bytes → base64url，前綴不含完整金鑰", () => {
    const key = encodePmsKey(new Uint8Array(32).fill(255));
    expect(key.startsWith(PMS_KEY_PREFIX)).toBe(true);
    expect(key.slice(PMS_KEY_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const prefix = pmsKeyDisplayPrefix(key);
    expect(prefix.endsWith("...")).toBe(true);
    expect(prefix.length).toBeLessThan(key.length);
  });
});

describe("前端純函式", () => {
  it("刪除需先停用且名稱完全相符", () => {
    expect(canDeleteKey({ is_active: true, name: "PMS" }, "PMS")).toBe(false);
    expect(canDeleteKey({ is_active: false, name: "PMS" }, "pms")).toBe(false);
    expect(canDeleteKey({ is_active: false, name: "PMS" }, "PMS")).toBe(true);
  });
  it("台北日期", () => {
    expect(taipeiToday(new Date("2026-06-10T16:30:00Z"))).toBe("2026-06-11");
    expect(taipeiToday(new Date("2026-06-10T15:59:00Z"))).toBe("2026-06-10");
  });
  it("performance 摘要", () => {
    const s = summarizePerformance({ summary: { booked: { orders: 3, net_revenue: 12000 }, stay: { occupied_room_nights: 4, available_room_nights: 5, occupancy_rate: 0.8, check_ins: 2 } } });
    expect(s).toEqual({ bookedOrders: 3, netRevenue: 12000, occupiedRoomNights: 4, availableRoomNights: 5, occupancyRate: 0.8, checkIns: 2 });
    expect(summarizePerformance({ error: "x" })).toBeNull();
    expect(formatRate(0.8)).toBe("80.0%");
    expect(formatRate(null)).toBe("—");
  });
  it("串接範例涵蓋雙軸與住房率端點", () => {
    const sn = buildPmsSnippets("https://x/functions/v1/accommodation-api", "KEY", "2026-06-10");
    const all = sn.map((s) => s.code).join("\n");
    expect(all).toContain("/performance?from=2026-06-10&to=2026-06-10");
    expect(all).toContain("/performance?from=2026-05-12&to=2026-06-10");
    expect(all).toContain("/availability?from=2026-06-10&to=2026-07-09");
    expect(all).toContain("x-api-key: KEY");
  });
});

describe("安全性（原始碼層級）", () => {
  const fn = read("supabase/functions/create-pms-api-key/index.ts");
  const page = read("apps/booking/src/pages/admin/PmsApiKeys.tsx");
  const legacy = read("apps/booking/src/components/headquarters/AccommodationApiKeysManagement.tsx");
  it("Edge Function 僅限 super_admin、伺服器亂數、只存雜湊、no-store", () => {
    expect(fn).toContain('ctx.globalRoles.includes("super_admin")');
    expect(fn).toContain("!ctx.userId");
    expect(fn).not.toContain("hotel_admin");
    expect(fn).toContain("crypto.getRandomValues");
    expect(fn).toContain("key_hash: keyHash");
    expect(fn).toContain("no-store");
    expect(fn).not.toMatch(/console\.\w+\([^)]*plain/);
    expect(read("supabase/config.toml")).toMatch(/\[functions\.create-pms-api-key\]\s*\n\s*verify_jwt = true/);
  });
  it("前端不再產生或雜湊金鑰", () => {
    for (const src of [page, legacy]) {
      expect(src).not.toContain("getRandomValues");
      expect(src).not.toContain("crypto.subtle");
      expect(src).not.toContain("key_hash");
    }
    expect(page).toContain('functions.invoke("create-pms-api-key"');
  });
  it("未修改 _shared/accommodationApiKey.ts 的驗證方式（SHA-256 hash 查詢）", () => {
    expect(read("supabase/functions/_shared/accommodationApiKey.ts")).toContain("verify_accommodation_api_key");
  });
});

describe("渲染", () => {
  it("頁面渲染安全說明與產生按鈕", () => {
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(PmsApiKeys)));
    expect(html).toContain("pms-api-keys-page");
    expect(html).toContain("pms-key-create-open");
    expect(html).toContain("pms-key-security-notes");
  });
  it("明文顯示一次，未勾選保存前不可完成", () => {
    const html = renderToStaticMarkup(React.createElement(PmsKeyReveal, {
      apiKey: "acc_pms_TEST", isReadOnly: true, acknowledged: false, onAcknowledge: () => {}, onDone: () => {},
    }));
    expect(html).toContain("acc_pms_TEST");
    expect(html).toContain("只顯示這一次");
    expect(html).toContain("pms-key-test-btn");
    expect(html).toMatch(/data-testid="pms-key-done-btn"[^>]*disabled|disabled[^>]*data-testid="pms-key-done-btn"/);
  });
});
