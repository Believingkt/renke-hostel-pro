// 推價給奧丁丁前過濾：價格 <= 0（或不是數字）的日期不推，回傳略過清單
export interface RateRow {
  room_type_id: string;
  date: string;
  price: number;
}

export function splitPushableRates(rows: RateRow[]): {
  pushable: RateRow[];
  skipped: { room_type_id: string; dates: string[] }[];
} {
  const pushable: RateRow[] = [];
  const skippedMap = new Map<string, string[]>();
  for (const r of rows) {
    const p = Number(r.price);
    if (Number.isFinite(p) && p > 0) {
      pushable.push(r);
    } else {
      const arr = skippedMap.get(r.room_type_id) ?? [];
      arr.push(r.date);
      skippedMap.set(r.room_type_id, arr);
    }
  }
  return {
    pushable,
    skipped: [...skippedMap.entries()].map(([room_type_id, dates]) => ({ room_type_id, dates })),
  };
}
