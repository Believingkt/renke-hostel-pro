// owlting-cm 費率略過紀錄：方案型費率不寫房型基底列、房型對不到只略過該筆
export interface IgnoredRate {
  reason: "package_plan" | "room_not_found";
  invCode: string;
  roomTypeId: string | null;
  ratePlanCode: string | null;
  start: string;
  end: string;
  price: number;
}

const REASON_LABEL: Record<IgnoredRate["reason"], string> = {
  package_plan: "方案型費率不寫入房型基底列",
  room_not_found: "房型對不到",
};

// 依（原因、房型代碼、房型 id、費率代碼）合併：日期取最早～最晚，價格列出不重複值
export function summarizeIgnoredRates(items: IgnoredRate[]): string {
  const groups = new Map<string, {
    reason: string; inv_type_code: string; room_type_id: string | null; rate_plan_code: string | null;
    date_from: string; date_to: string; prices: Set<number>; blocks: number;
  }>();
  for (const it of items) {
    const key = [it.reason, it.invCode, it.roomTypeId ?? "", it.ratePlanCode ?? ""].join("|");
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        reason: REASON_LABEL[it.reason], inv_type_code: it.invCode, room_type_id: it.roomTypeId,
        rate_plan_code: it.ratePlanCode, date_from: it.start, date_to: it.end, prices: new Set([it.price]), blocks: 1,
      });
    } else {
      if (it.start < g.date_from) g.date_from = it.start;
      if (it.end > g.date_to) g.date_to = it.end;
      g.prices.add(it.price);
      g.blocks += 1;
    }
  }
  const rows = [...groups.values()].map((g) => ({ ...g, prices: [...g.prices].sort((a, b) => a - b).slice(0, 30) }));
  const pkg = items.filter((i) => i.reason === "package_plan").length;
  const nf = items.length - pkg;
  return `略過費率 ${items.length} 筆（方案型 ${pkg}、房型對不到 ${nf}）：${JSON.stringify(rows)}`.slice(0, 20000);
}
