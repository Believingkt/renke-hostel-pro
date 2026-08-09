// 合作期間 gate：以 accommodation_partnership_periods 判斷該館別在訂單日是否處於
// 可採計「成交大師獎金」（成交組分潤／影音分潤）的合作期間。
//
// 判定依據為 counts_closer_commission（舊資料 bonus_policy='none' 已同步為 false）。
// 無任何期間 → 不採計。
//
// 由 create-commission-snapshots 與 preview-closer-commission 共用，確保
// 「業績統計」與「發放管理」口徑一致。


const pad2 = (n: number) => String(n).padStart(2, "0");

/** 台北時區日期字串（YYYY-MM-DD） */
export function taipeiDateStr(iso: string): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of f.formatToParts(new Date(iso))) parts[p.type] = p.value;
  return `${parts.year}-${pad2(Number(parts.month))}-${pad2(Number(parts.day))}`;
}

export async function buildPartnershipResolver(
  client: any,
  accIds: string[],
): Promise<(accId: string, orderDateIso: string) => boolean> {
  const byAcc = new Map<string, Array<{ start: string; end: string | null }>>();
  const ids = Array.from(new Set((accIds ?? []).filter(Boolean)));
  if (ids.length > 0) {
    const { data } = await client
      .from("accommodation_partnership_periods")
      .select("accommodation_id, start_date, end_date, bonus_policy, counts_closer_commission")
      .in("accommodation_id", ids);
    for (const row of (data ?? []) as any[]) {
      if (!row?.accommodation_id || !row?.start_date) continue;
      if (row?.bonus_policy === "none") continue;
      if (row?.counts_closer_commission === false) continue;

      const list = byAcc.get(row.accommodation_id) ?? [];
      list.push({
        start: String(row.start_date).slice(0, 10),
        end: row.end_date ? String(row.end_date).slice(0, 10) : null,
      });
      byAcc.set(row.accommodation_id, list);
    }
  }
  return (accId: string, orderDateIso: string) => {
    const list = byAcc.get(accId);
    if (!list || list.length === 0) return false;
    const d = taipeiDateStr(orderDateIso);
    return list.some((p) => d >= p.start && (p.end === null || d <= p.end));
  };
}
