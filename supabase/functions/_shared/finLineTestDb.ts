// 測試用記憶體 Supabase 假 client（fin-line 橋接／callback 測試共用；不在正式程式引用）
// deno-lint-ignore-file no-explicit-any
type Row = Record<string, any>;

export function fakeDb(tables: Record<string, Row[]> = {}) {
  const t = (name: string) => (tables[name] ??= []);
  const from = (name: string) => {
    const preds: ((r: Row) => boolean)[] = [];
    let mode: "select" | "insert" | "update" = "select";
    let inserted: Row[] = [];
    let patch: Row = {};
    let sort: [string, boolean] | null = null;
    let lim: number | null = null;
    const rows = () => {
      if (mode === "insert") return inserted;
      let out = t(name).filter((r) => preds.every((p) => p(r)));
      if (sort) { const [c, asc] = sort; out = [...out].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1)); }
      if (lim != null) out = out.slice(0, lim);
      if (mode === "update") out.forEach((r) => Object.assign(r, patch));
      return out;
    };
    const b: any = {
      select: () => b,
      insert: (row: Row | Row[]) => {
        mode = "insert";
        inserted = (Array.isArray(row) ? row : [row]).map((r) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r }));
        for (const r of inserted) {
          if (name === "fin_line_sessions" && t(name).some((x) => x.external_conversation_id === r.external_conversation_id)) throw new Error("unique violation");
          t(name).push(r);
        }
        return b;
      },
      update: (p: Row) => { mode = "update"; patch = p; return b; },
      eq: (c: string, v: any) => { preds.push((r) => r[c] === v); return b; },
      is: (c: string, v: any) => { preds.push((r) => (r[c] ?? null) === v); return b; },
      in: (c: string, vs: any[]) => { preds.push((r) => vs.includes(r[c])); return b; },
      gt: (c: string, v: any) => { preds.push((r) => r[c] > v); return b; },
      order: (c: string, o?: { ascending?: boolean }) => { sort = [c, o?.ascending !== false]; return b; },
      limit: (n: number) => { lim = n; return b; },
      single: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
    };
    return b;
  };
  return { from, tables };
}

/** 依 URL 回應的假 fetch，記錄所有呼叫 */
export function fakeFetch(route: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit; body: any }[] = [];
  const fn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    let body: any = init.body;
    try { body = typeof init.body === "string" ? JSON.parse(init.body) : init.body; } catch { /* keep raw */ }
    calls.push({ url, init, body });
    return await route(url, init);
  }) as typeof fetch;
  return { fn, calls };
}
