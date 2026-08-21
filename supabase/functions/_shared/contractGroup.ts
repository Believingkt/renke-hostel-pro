/**
 * 合約群組（contract_group_id）口徑 — Edge Function 版本
 * 一份合約 = 一筆資格；新口徑自 2026-08-01 起生效。
 * 前端對應檔：src/lib/contractGroup.ts
 */
export const CONTRACT_GROUP_CUTOFF = "2026-08-01";

export interface ContractGroupRow {
  contract_group_id?: string | null;
  created_at?: string | null;
}

/** 以合約群組去重：同一個 contract_group_id 只保留最早建立的一筆 */
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

export function countContracts<T extends ContractGroupRow>(rows: T[]): number {
  return dedupeByContractGroup(rows).length;
}
