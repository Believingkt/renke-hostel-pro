// PAYUNi W2 測試用的極簡 Supabase client 假物件（記憶體資料表；只實作 handler 用到的鏈式方法）
// deno-lint-ignore-file no-explicit-any
type Row = Record<string, any>;
type Filter = { op: "eq" | "neq" | "like" | "in" | "gte"; col: string; val: any };

const match = (r: Row, fs: Filter[]) =>
  fs.every((f) => f.op === "eq" ? r[f.col] === f.val
    : f.op === "neq" ? r[f.col] !== f.val
    : f.op === "in" ? (f.val as any[]).includes(r[f.col])
    : f.op === "gte" ? String(r[f.col]) >= String(f.val)
    : typeof r[f.col] === "string" && r[f.col].startsWith(String(f.val).replace(/%$/, "")));

const NOTIFY_KEY = (r: Row) =>
  [r.source, r.notify_type ?? "", r.mer_id ?? "", r.trade_no ?? "", r.execute_time ?? ""].join("|");

export class FakeDb {
  tables: Record<string, Row[]>;
  writes: Array<{ table: string; op: string; values: Row }> = [];
  failOn: Record<string, string> = {};
  rpcCalls: Array<{ name: string; args: any }> = [];
  private seq = 0;

  constructor(tables: Record<string, Row[]> = {}) {
    this.tables = structuredClone(tables);
  }
  rows(t: string) { return (this.tables[t] ??= []); }

  client() {
    const db = this;
    return {
      rpcCalls: db.rpcCalls,
      rpc(name: string, args: any) {
        db.rpcCalls.push({ name, args });
        if (name === "update_order_with_context") {
          const o = db.rows("orders").find((r) => r.id === args.p_order_id);
          if (o) Object.assign(o, structuredClone(args.p_patch));
        }
        return Promise.resolve({ data: null, error: null });
      },
      from(table: string) {
        const filters: Filter[] = [];
        let mode: "select" | "insert" | "update" | "upsert" = "select";
        let values: Row = {};
        let onConflict = "id";
        let wantSingle: "single" | "maybe" | null = null;

        const run = () => {
          const fail = db.failOn[`${table}.${mode}`];
          if (fail) return { data: null, error: { message: fail } };
          const rows = db.rows(table);
          if (mode === "insert") {
            if (table === "payuni_notify_events" && values.hash_valid &&
              rows.some((r) => r.hash_valid && NOTIFY_KEY(r) === NOTIFY_KEY(values))) {
              return { data: null, error: { code: "23505", message: "duplicate key" } };
            }
            const row = { id: `id-${++db.seq}`, ...structuredClone(values) };
            rows.push(row);
            db.writes.push({ table, op: "insert", values: structuredClone(values) });
            return { data: wantSingle ? { id: row.id } : [row], error: null };
          }
          if (mode === "update") {
            const hit = rows.filter((r) => match(r, filters));
            hit.forEach((r) => Object.assign(r, structuredClone(values)));
            db.writes.push({ table, op: "update", values: structuredClone(values) });
            return { data: wantSingle ? (hit[0] ? { id: hit[0].id } : null) : null, error: null };
          }
          if (mode === "upsert") {
            const existing = rows.find((r) => r[onConflict] === values[onConflict]);
            if (existing) Object.assign(existing, structuredClone(values));
            else rows.push(structuredClone(values));
            db.writes.push({ table, op: "upsert", values: structuredClone(values) });
            return { data: null, error: null };
          }
          const hit = rows.filter((r) => match(r, filters)).map((r) => structuredClone(r));
          if (wantSingle) return { data: hit[0] ?? null, error: null };
          return { data: hit, error: null };
        };

        const q: any = {
          select() { return q; },
          eq(col: string, val: any) { filters.push({ op: "eq", col, val }); return q; },
          like(col: string, val: any) { filters.push({ op: "like", col, val }); return q; },
          neq(col: string, val: any) { filters.push({ op: "neq", col, val }); return q; },
          in(col: string, val: any[]) { filters.push({ op: "in", col, val }); return q; },
          gte(col: string, val: any) { filters.push({ op: "gte", col, val }); return q; },
          order() { return q; },
          limit() { return q; },
          insert(v: Row) { mode = "insert"; values = v; return q; },
          update(v: Row) { mode = "update"; values = v; return q; },
          upsert(v: Row, opts?: { onConflict?: string }) { mode = "upsert"; values = v; onConflict = opts?.onConflict ?? "id"; return q; },
          maybeSingle() { wantSingle = "maybe"; return Promise.resolve(run()); },
          single() { wantSingle = "single"; return Promise.resolve(run()); },
          then(ok: any, bad: any) { return Promise.resolve(run()).then(ok, bad); },
        };
        return q;
      },
    };
  }
}
