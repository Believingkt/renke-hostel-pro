/**
 * 合約群組（contract_group_id）口徑
 *
 * 一份合約 = 一筆資格。同一支折扣代碼、同一合作月份、同一場域的多筆邀約
 * （例如 KOL 為了多住一天開兩個帳號）由 DB 觸發器自動歸為同一個
 * contract_group_id，後台可人工合併／拆分（例如星夢劇場＋天使星夢度假村
 * 這種跨場域的品牌聯名合作，屬於同一份合約）。
 *
 * 新口徑自 2026-08-01 起生效（2026-08-10 期發放起算），
 * 之前的資料 contract_group_id 為空，維持一筆一件的舊算法。
 */
export const CONTRACT_GROUP_CUTOFF = "2026-08-01";

export interface ContractGroupRow {
  contract_group_id?: string | null;
  created_at?: string | null;
}

/** 該筆邀約的合作檔期（kpi_month 優先，其次 check_in_date） */
export function contractPeriodOf(row: {
  kpi_month?: string | null;
  check_in_date?: string | null;
}): string | null {
  return row.kpi_month ?? row.check_in_date ?? null;
}

/** 是否套用新口徑（合作檔期 >= 2026-08-01） */
export function isContractScoped(row: {
  kpi_month?: string | null;
  check_in_date?: string | null;
}): boolean {
  const p = contractPeriodOf(row);
  return !!p && p >= CONTRACT_GROUP_CUTOFF;
}

/**
 * 以合約群組去重：同一個 contract_group_id 只保留最早建立的一筆。
 * 沒有 contract_group_id 的（舊資料）一律保留。
 */
export function dedupeByContractGroup<T extends ContractGroupRow>(rows: T[]): T[] {
  const firstByGroup = new Map<string, T>();
  const passthrough: T[] = [];
  for (const r of rows) {
    const gid = r.contract_group_id;
    if (!gid) {
      passthrough.push(r);
      continue;
    }
    const cur = firstByGroup.get(gid);
    if (!cur || (r.created_at ?? "") < (cur.created_at ?? "")) {
      firstByGroup.set(gid, r);
    }
  }
  return [...passthrough, ...firstByGroup.values()];
}

/** 去重後的件數 */
export function countContracts<T extends ContractGroupRow>(rows: T[]): number {
  return dedupeByContractGroup(rows).length;
}

/** 因合約歸戶而被折抵掉的重複件數 */
export function duplicateContractCount<T extends ContractGroupRow>(rows: T[]): number {
  return rows.length - countContracts(rows);
}
