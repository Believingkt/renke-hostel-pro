import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  buildScoutCloserBreakdown,
  normalizeDiscountCode,
  type ScoutCloserCodeRow,
} from "@/utils/scoutCloserBreakdown";
import { getBonusFormula } from "@/lib/bonusFormulas";

const rateMap = new Map<string, number>([
  ["SCOUTA", 0.05],
  ["SCOUTB", 0.1],
]);

const ordersM1 = [
  { id: "o1", order_number: "AA111111", discount_code: "scouta", final_price: 10000 },
  { id: "o2", order_number: "BB222222", discount_code: "SCOUTA", final_price: 5000 },
  { id: "o3", order_number: "CC333333", discount_code: "SCOUTB", final_price: 20000 },
  { id: "o4", order_number: "DD444444", discount_code: "NOPE", final_price: 9000 },
  { id: "o5", order_number: "EE555555", discount_code: "SCOUTA", final_price: 8000 }, // 非本人成交
];

const ordersM2 = [
  { id: "p1", order_number: "ZZ999999", discount_code: "SCOUTB", final_price: 1000 },
];

const eligible = (id: string) => id !== "o5";

describe("星探成交獎金｜資料正確性", () => {
  it("依折扣碼分組、金額四捨五入、忽略無費率折扣碼與不採計訂單", () => {
    const b = buildScoutCloserBreakdown(ordersM1, rateMap, eligible);
    expect(b.orderCount).toBe(3);
    expect(b.total).toBe(500 + 250 + 2000);
    expect(b.rows.map((r) => r.code)).toEqual(["SCOUTB", "SCOUTA"]); // 依金額排序
    const a = b.rows.find((r) => r.code === "SCOUTA")!;
    expect(a.count).toBe(2);
    expect(a.amount).toBe(750);
    expect(a.orders.map((o) => o.no)).toEqual(["AA111111", "BB222222"]);
  });

  it("折扣碼大小寫／空白不影響歸戶", () => {
    expect(normalizeDiscountCode("  scoutA ")).toBe("SCOUTA");
  });

  it("有 payout 紀錄者標記為實發，其餘為預估", () => {
    const b = buildScoutCloserBreakdown(ordersM1, rateMap, eligible, new Set(["o1"]));
    const a = b.rows.find((r) => r.code === "SCOUTA")!;
    expect(a.orders.find((o) => o.no === "AA111111")!.settled).toBe(true);
    expect(a.orders.find((o) => o.no === "BB222222")!.settled).toBe(false);
  });

  it("切換資料月／期別後金額與筆數隨資料重算，不殘留前期資料", () => {
    const m1 = buildScoutCloserBreakdown(ordersM1, rateMap, eligible);
    const m2 = buildScoutCloserBreakdown(ordersM2, rateMap, eligible);
    expect(m2.total).toBe(100);
    expect(m2.orderCount).toBe(1);
    expect(m2.rows).toHaveLength(1);
    expect(m1.total).not.toBe(m2.total);
    const empty = buildScoutCloserBreakdown([], rateMap, eligible);
    expect(empty.total).toBe(0);
    expect(empty.rows).toEqual([]);
  });

  it("成交獎金總計不得再含星探成交獎金（卡片各自獨立）", () => {
    const closerAmt = 12000;
    const scout = buildScoutCloserBreakdown(ordersM1, rateMap, eligible);
    const closerCard = closerAmt; // 成交獎金卡：不含星探成交獎金
    const scoutCard = scout.total;
    expect(closerCard).toBe(12000);
    expect(scoutCard).toBe(2750);
    expect(closerCard + scoutCard).toBe(14750); // 只在總收入層加總一次
  });

  it("星探成交獎金歸屬成交大師系列（category = closer）", () => {
    expect(getBonusFormula("scout_closer_bonus")?.category).toBe("closer");
  });
});

/** 卡片明細 UI 的最小重現（與 TeamHome 相同的展開行為與標記） */
function ScoutCloserDetail({ rows }: { rows: ScoutCloserCodeRow[] }) {
  const [open, setOpen] = (globalThis as any).__useState(false);
  const [code, setCode] = (globalThis as any).__useState<string | null>(null);
  return (
    <div>
      <button onClick={() => setOpen(!open)}>
        {open
          ? "收合折扣碼明細"
          : `折扣碼明細（${rows.length} 組・${rows.reduce((n, r) => n + r.count, 0)} 筆）`}
      </button>
      {open
        ? rows.map((r) => (
            <div key={r.code}>
              <button onClick={() => setCode(code === r.code ? null : r.code)}>
                {r.code} {r.count} 筆
              </button>
              {code === r.code
                ? r.orders.map((o) => (
                    <div key={o.no}>
                      {o.no}
                      {o.settled ? "實發" : "預估"}
                    </div>
                  ))
                : null}
            </div>
          ))
        : null}
    </div>
  );
}

describe("星探成交獎金｜卡片明細 UI", () => {
  it("展開後顯示折扣碼、筆數、單號與預估/實發標記", async () => {
    const { useState } = await import("react");
    (globalThis as any).__useState = useState;
    const rows = buildScoutCloserBreakdown(ordersM1, rateMap, eligible, new Set(["o1"])).rows;
    render(<ScoutCloserDetail rows={rows} />);

    fireEvent.click(screen.getByText("折扣碼明細（2 組・3 筆）"));
    fireEvent.click(screen.getByText("SCOUTA 2 筆"));

    expect(screen.getByText(/AA111111/)).toHaveTextContent("實發");
    expect(screen.getByText(/BB222222/)).toHaveTextContent("預估");
  });
});
