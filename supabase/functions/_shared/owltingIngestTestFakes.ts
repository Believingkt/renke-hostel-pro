// 測試專用（不部署）：owlting-email-ingest 的假 Supabase client 與假 parser，只透過 test_import_map_ingest.json 替換
type Row = Record<string, any>;
type Filter = [op: string, col: string, val: unknown];
export interface Write { table: string; op: "insert" | "update"; values: Row; filters: Filter[] }
export interface Read { table: string; cols: string; filters: Filter[] }

let seq = 0;
const like = (v: unknown, pat: string) =>
  new RegExp("^" + pat.split("%").map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$").test(String(v ?? ""));
const match = (r: Row, f: Filter[]) => f.every(([op, c, v]) => {
  if (c.includes(".")) return true;
  switch (op) {
    case "eq": return r[c] === v;
    case "neq": return r[c] !== v;
    case "in": return (v as unknown[]).includes(r[c]);
    case "is": return v === null ? r[c] == null : r[c] === v;
    case "not_is": return v === null ? r[c] != null : r[c] !== v;
    case "lt": return r[c] < (v as any);
    case "gt": return r[c] > (v as any);
    case "like": return like(r[c], v as string);
    default: return true;
  }
});

export class FakeDb {
  tables: Record<string, Row[]> = {};
  writes: Write[] = [];
  reads: Read[] = [];
  rpcCalls: { name: string; args: Row }[] = [];
  rpcImpl: (name: string, args: Row) => { data: any; error: any } = () => ({ data: { ok: true, order_updated: 1, conflicts: [] }, error: null });
  selectError: (r: Read) => string | null = () => null;

  constructor(tables: Record<string, Row[]> = {}) {
    for (const [k, v] of Object.entries(tables)) this.tables[k] = v.map((x) => ({ ...x }));
  }
  rows(t: string) { return (this.tables[t] ??= []); }

  client() {
    const db = this;
    const from = (table: string) => {
      const filters: Filter[] = [];
      let op: "select" | "insert" | "update" = "select";
      let values: any = null;
      let cols = "*";
      let mode: "many" | "single" | "maybe" = "many";
      let lim: number | null = null;
      const exec = () => {
        if (op === "insert") {
          const list = (Array.isArray(values) ? values : [values]).map((v: Row) => ({
            id: `${table}-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(),
            ...(table === "owlting_email_orders_raw" ? { received_at: new Date().toISOString() } : {}), ...v,
          }));
          db.rows(table).push(...list);
          db.writes.push({ table, op, values: list[0], filters: [] });
          return { data: mode === "many" ? list : list[0], error: null };
        }
        if (op === "update") {
          for (const r of db.rows(table)) if (match(r, filters)) Object.assign(r, values);
          db.writes.push({ table, op, values, filters: [...filters] });
          return { data: null, error: null };
        }
        const read = { table, cols, filters: [...filters] };
        db.reads.push(read);
        const err = db.selectError(read);
        if (err) return { data: null, error: { message: err } };
        let rows = db.rows(table).filter((r) => match(r, filters)).map((r) => ({ ...r }));
        if (lim != null) rows = rows.slice(0, lim);
        if (mode === "single") return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: "no rows" } };
        if (mode === "maybe") return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null };
      };
      const add = (o: string) => (c: string, v: unknown) => { filters.push([o, c, v]); return b; };
      const b: any = {
        select: (c?: string) => { if (op === "select") cols = c ?? "*"; return b; },
        insert: (v: any) => { op = "insert"; values = v; return b; },
        update: (v: Row) => { op = "update"; values = v; return b; },
        eq: add("eq"), neq: add("neq"), in: add("in"), is: add("is"), lt: add("lt"), gt: add("gt"), like: add("like"),
        not: (c: string, o: string, v: unknown) => { filters.push([`not_${o}`, c, v]); return b; },
        order: () => b, limit: (n: number) => { lim = n; return b; },
        single: () => { mode = "single"; return b; }, maybeSingle: () => { mode = "maybe"; return b; },
        then: (ok: any, ng: any) => Promise.resolve().then(exec).then(ok, ng),
      };
      return b;
    };
    const rpc = (name: string, args: Row) => {
      db.rpcCalls.push({ name, args });
      return Promise.resolve(db.rpcImpl(name, args));
    };
    return { from, rpc };
  }
}

const g = globalThis as any;
// 替換 https://esm.sh/@supabase/supabase-js@2.76.1
export function createClient(..._args: unknown[]) {
  if (!g.__ingestFakeDb) throw new Error("__ingestFakeDb not set");
  return (g.__ingestFakeDb as FakeDb).client();
}
// 替換 ../_shared/owltingHtmlParser.ts
export interface FakeParsedFields {
  modification_changes?: { field: string; label: string; before: string | number | null; after: string | number | null }[] | null;
  warnings: string[];
  [k: string]: any;
}
export function parseOwlNestForwardEmail(_input: unknown): FakeParsedFields {
  if (!g.__ingestFakeParsed) throw new Error("__ingestFakeParsed not set");
  return g.__ingestFakeParsed;
}
