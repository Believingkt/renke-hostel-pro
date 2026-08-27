import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PAYOUT_MONTH_REQUIRED_ERROR,
  resolvePayoutMonth,
} from "./payoutMonthResolver.ts";

const EXEC = { payoutYear: 2026, payoutMonth: 8 };

Deno.test("手動重算未帶 payout_month → 400，且不回傳任何 payout_month（不覆寫既有值）", () => {
  const res = resolvePayoutMonth({ body: { test_mode: true, test_month: "2026-08" }, ...EXEC });
  assertEquals(res.ok, false);
  if (res.ok) throw new Error("unreachable");
  assertEquals(res.status, 400);
  assertEquals(res.error, PAYOUT_MONTH_REQUIRED_ERROR);
  assertEquals("payoutMonthStr" in res, false);
});

Deno.test("手動重算 payout_month 為空字串 / 格式錯誤 / 非字串 → 一律 400", () => {
  for (const bad of ["", "2026-8", "202608", "2026/09", 202609, null, undefined, {}]) {
    const res = resolvePayoutMonth({
      body: { test_mode: true, test_month: "2026-08", payout_month: bad },
      ...EXEC,
    });
    assertEquals(res.ok, false, `expected 400 for ${JSON.stringify(bad)}`);
    if (!res.ok) assertEquals(res.status, 400);
  }
});

Deno.test("手動重算帶合法 payout_month → 使用 override，不使用執行當月", () => {
  const res = resolvePayoutMonth({
    body: { test_mode: true, test_month: "2026-08", payout_month: "2026-09" },
    ...EXEC,
  });
  assertEquals(res.ok, true);
  if (!res.ok) throw new Error("unreachable");
  assertEquals(res.payoutMonthStr, "2026-09");
  assertEquals(res.source, "override");
});

Deno.test("排程執行（非 test_mode）未帶 payout_month → 使用執行當月，不回 400", () => {
  const res = resolvePayoutMonth({ body: {}, ...EXEC });
  assertEquals(res.ok, true);
  if (!res.ok) throw new Error("unreachable");
  assertEquals(res.payoutMonthStr, "2026-08");
  assertEquals(res.source, "execution_month");
});

Deno.test("排程執行帶合法 payout_month → 仍尊重 override", () => {
  const res = resolvePayoutMonth({ body: { payout_month: "2026-09" }, ...EXEC });
  assertEquals(res.ok, true);
  if (!res.ok) throw new Error("unreachable");
  assertEquals(res.payoutMonthStr, "2026-09");
});

Deno.test("月份補零：執行當月 1 月 → 2026-01", () => {
  const res = resolvePayoutMonth({ body: {}, payoutYear: 2026, payoutMonth: 1 });
  assertEquals(res.ok && res.payoutMonthStr, "2026-01");
});
