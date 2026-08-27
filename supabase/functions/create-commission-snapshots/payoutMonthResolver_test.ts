import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PAYOUT_MONTH_REQUIRED_ERROR,
  isValidMonthKey,
  nextMonthKey,
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

Deno.test("手動重算 payout_month 為空字串 / 格式錯誤 / 非字串 / 月份超界 → 一律 400", () => {
  for (const bad of ["", "2026-8", "202608", "2026/09", "2026-13", "2026-00", 202609, null, undefined, {}]) {
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

Deno.test("payout_month === snapshot_month → 400 並提示正確發放月", () => {
  const res = resolvePayoutMonth({
    body: { test_mode: true, payout_month: "2026-08" },
    snapshotMonth: "2026-08",
    ...EXEC,
  });
  assertEquals(res.ok, false);
  if (res.ok) throw new Error("unreachable");
  assertEquals(res.status, 400);
  assertEquals(res.error.includes("2026-09"), true);
});

Deno.test("排程執行時執行當月剛好等於資料月 → 400（避免同期別快照）", () => {
  const res = resolvePayoutMonth({ body: {}, snapshotMonth: "2026-08", ...EXEC });
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.status, 400);
});

Deno.test("排程執行（非 test_mode）未帶 payout_month → 使用執行當月，不回 400", () => {
  const res = resolvePayoutMonth({ body: {}, snapshotMonth: "2026-07", ...EXEC });
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

Deno.test("跨年：資料月 2026-12 → 預期發放月 2027-01；帶 2026-12 直接 400", () => {
  assertEquals(nextMonthKey("2026-12"), "2027-01");
  const ok = resolvePayoutMonth({
    body: { test_mode: true, payout_month: "2027-01" },
    snapshotMonth: "2026-12",
    payoutYear: 2026,
    payoutMonth: 12,
  });
  assertEquals(ok.ok && ok.payoutMonthStr, "2027-01");

  const bad = resolvePayoutMonth({
    body: { test_mode: true, payout_month: "2026-12" },
    snapshotMonth: "2026-12",
    payoutYear: 2026,
    payoutMonth: 12,
  });
  assertEquals(bad.ok, false);
  if (!bad.ok) assertEquals(bad.error.includes("2027-01"), true);
});

Deno.test("跨年推算錯誤（2026-12 → 2026-01 倒退）仍可送出但 snapshot 相同時攔截；月份合法性檢查", () => {
  assertEquals(isValidMonthKey("2026-13"), false);
  assertEquals(isValidMonthKey("2026-00"), false);
  assertEquals(isValidMonthKey("2026-01"), true);
  assertEquals(nextMonthKey("2026-13"), null);
  assertEquals(nextMonthKey(""), null);
});

Deno.test("snapshotMonth 格式錯誤 → 不做期別比對，維持原行為", () => {
  const res = resolvePayoutMonth({
    body: { test_mode: true, payout_month: "2026-09" },
    snapshotMonth: "bad",
    ...EXEC,
  });
  assertEquals(res.ok && res.payoutMonthStr, "2026-09");
});
