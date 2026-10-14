// E3 價格比對報告產生器（純記憶體，不連任何資料庫）
// 執行：cd /app && npx vitest run --config docs/pricing-1a/scratch/vitest.report.config.ts --root /app
import { it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { computeDiscountedRoomCharge } from "../../../packages/shared/src/utils/discountPricing";

type Tier = "weekday" | "friday_sunday" | "weekend";
const DIR = "/app/docs/pricing-1a/scratch";
const snap = JSON.parse(readFileSync(`${DIR}/p3_snapshot.json`, "utf8"));
const START = "2026-10-14";
const DAYS = 90;
const holidays = new Set<string>(
  snap.public_holidays.filter((h: any) => ["holiday", "compensatory_day_off"].includes(h.holiday_type)).map((h: any) => h.holiday_date),
);

const addDays = (d: string, n: number) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
};
// 與 validate-order-prices / classify_day_tier 相同：館別假日或週六＝假日、週五週日＝旺日、其餘平日
const tierOf = (d: string): Tier => {
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
  return holidays.has(d) || dow === 6 ? "weekend" : dow === 5 || dow === 0 ? "friday_sunday" : "weekday";
};
const tplKey = { weekday: "weekday", friday_sunday: "peak", weekend: "weekend" } as const;

function packagePrice(pkg: any, d: string) {
  const tier = tierOf(d);
  const ov = snap.package_date_prices.find((r: any) => r.package_id === pkg.id && r.date === d);
  const ovSale = ov?.sale_price != null ? Number(ov.sale_price) : null;
  const tp = pkg.tier_prices?.[tier];
  const sale = ovSale != null ? ovSale : tp?.sale != null ? Number(tp.sale) : Number(pkg.sale_price);
  const pkgOrig = pkg.original_price != null ? Number(pkg.original_price) : null;
  const original =
    ovSale != null && ov?.original_price != null && Number(ov.original_price) > 0 ? Number(ov.original_price)
      : ovSale != null ? ovSale
        : tp?.original != null && Number(tp.original) > 0 ? Number(tp.original)
          : pkgOrig != null && pkgOrig > 0 ? pkgOrig : sale;
  return { sale, original };
}
// 專案價：同 RoomPriceCalendar（該日型關閉＝不可售；有開但無價則回退同專案其他日型）
function templatePrice(t: any, d: string): number | "不可售" {
  const k = tplKey[tierOf(d)];
  if (t[`${k}_enabled`] === false) return "不可售";
  const wd = t.weekday_price, pk = t.peak_price, we = t.weekend_price;
  const own = t[`${k}_price`];
  if (own != null) return own;
  return k === "weekend" ? (we ?? pk ?? wd) : k === "peak" ? (pk ?? wd ?? we) : (wd ?? pk ?? we);
}

function applyC(s: any) {
  const pk = s.packages.map((p: any) => ({
    ...p,
    tier_prices: { ...p.tier_prices, weekday: { sale: Number(p.sale_price), original: Number(p.original_price) } },
  }));
  const tp = s.templates.map((t: any) => {
    if (t.template_name === "16人包棟") return { ...t, weekday_price: 41000, price: 41000 };
    if (t.template_name === "8人包棟") return { ...t, peak_price: 23600, peak_enabled: true };
    if (t.template_name === "10人包棟") return { ...t, peak_price: 29000, peak_enabled: true };
    return t;
  });
  return { packages: pk, templates: tp };
}

const APPROVED: Record<string, Tier> = { "16人包棟": "weekday", "8人包棟": "friday_sunday", "10人包棟": "friday_sunday" };
const TIER_ZH: Record<Tier, string> = { weekday: "平日", friday_sunday: "旺日", weekend: "假日" };

it("E3 report", () => {
  const before = { packages: snap.packages, templates: snap.templates };
  const after = applyC(snap);
  const approved: string[] = [];
  const unexpected: string[] = [];
  let total = 0, same = 0, approvedCells = 0;
  for (const pkg of before.packages) {
    const pkgAfter = after.packages.find((p: any) => p.id === pkg.id);
    const tBefore = before.templates.find((t: any) => t.default_package_id === pkg.id);
    const tAfter = after.templates.find((t: any) => t.default_package_id === pkg.id);
    for (let i = 0; i < DAYS; i++) {
      const d = addDays(START, i);
      const tier = tierOf(d);
      const b = packagePrice(pkg, d), a = packagePrice(pkgAfter, d);
      const cells: Array<[string, unknown, unknown]> = [
        ["方案售價", b.sale, a.sale],
        ["方案原價", b.original, a.original],
        ["專案價", templatePrice(tBefore, d), templatePrice(tAfter, d)],
      ];
      for (const [label, x, y] of cells) {
        total++;
        if (x === y) { same++; continue; }
        const line = `| ${pkg.name} | ${d} | ${TIER_ZH[tier]} | ${label} | ${x} | ${y} |`;
        if (label === "專案價" && APPROVED[pkg.name] === tier) { approved.push(line); approvedCells++; }
        else unexpected.push(line);
      }
    }
  }
  // D. 折扣碼 168168（原價 35%）抽樣：12人包棟平日、旺日、假日各一天
  const pkg12b = before.packages.find((p: any) => p.name === "12人包棟");
  const pkg12a = after.packages.find((p: any) => p.name === "12人包棟");
  const samples: string[] = [];
  let dcOk = true;
  for (const want of ["weekday", "friday_sunday", "weekend"] as Tier[]) {
    let d = START;
    while (tierOf(d) !== want || snap.package_date_prices.some((r: any) => r.package_id === pkg12b.id && r.date === d)) d = addDays(d, 1);
    const calc = (p: any) => {
      const { sale, original } = packagePrice(p, d);
      const r = computeDiscountedRoomCharge({ saleTotal: sale, originalTotal: original, discountKind: "percentage", discountValue: 35 });
      return { total: r.billedRoomTotal, discount: r.discountAmount, final: r.chargedRoomTotal };
    };
    const x = calc(pkg12b), y = calc(pkg12a);
    const eq = JSON.stringify(x) === JSON.stringify(y);
    dcOk &&= eq;
    samples.push(`| ${d} | ${TIER_ZH[want]} | ${x.total}／${x.discount}／${x.final} | ${y.total}／${y.discount}／${y.final} | ${eq ? "相同" : "不同"} |`);
  }
  const head = "| 方案 | 日期 | 日型 | 項目 | 轉換前 | 轉換後 |\n|---|---|---|---|---|---|";
  const md = [
    `# E3 價格比對（雲岫 7 方案 × ${START} 起 ${DAYS} 天；資料來源：p3_snapshot.json 讀取時間 ${snap.read_at_utc}）`,
    `假日表：${[...holidays].sort().join("、")}；單日價 package_date_prices：${snap.package_date_prices.map((r: any) => `${r.date}`).join("、")}（${snap.package_date_prices.length} 筆）`,
    "", `## A. 核准變動（${approved.length} 筆）`, head, ...approved,
    "", `## B. 非預期差異（${unexpected.length} 筆）`, head, ...unexpected,
    "", "## C. 統計",
    `- 總格數：${total}`, `- 完全相同格數：${same}`, `- 核准變動格數：${approvedCells}`, `- 非預期差異格數：${unexpected.length}`,
    "", "## D. 折扣碼 168168（原價 35%）抽樣：12人包棟", "| 日期 | 日型 | 轉換前 total／discount／final | 轉換後 total／discount／final | 結果 |", "|---|---|---|---|---|", ...samples,
    "", `通過判定：方案售價與原價差異 ${unexpected.filter((l) => !l.includes("專案價")).length} 筆；非預期專案價差異 ${unexpected.filter((l) => l.includes("專案價")).length} 筆；折扣碼抽樣${dcOk ? "全部相同" : "有差異"}`,
  ].join("\n");
  writeFileSync(`${DIR}/e3_report.md`, md + "\n");
});
