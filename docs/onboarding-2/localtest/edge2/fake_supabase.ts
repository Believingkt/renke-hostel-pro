// 2a-3 本機測試用假 Supabase client：user_roles／orders 等依固定測試資料回傳，支援 eq／is／in 篩選
export const calls: string[] = [];
export const A = "aaaaaaaa-0000-0000-0000-00000000000a";
export const B = "bbbbbbbb-0000-0000-0000-00000000000b";

type Role = { role: string; accommodation_id: string | null };
export const PERSONAS: Record<string, { email: string; roles: Role[] }> = {
  "u-owner": { email: "owner@a.tw", roles: [{ role: "hotel_admin", accommodation_id: A }, { role: "owner", accommodation_id: A }] },
  "u-staff": { email: "staff@a.tw", roles: [{ role: "staff", accommodation_id: A }] },
  "u-super": { email: "super@lakeze.com", roles: [{ role: "super_admin", accommodation_id: null }] },
  "u-admin": { email: "admin@lakeze.com", roles: [{ role: "admin", accommodation_id: null }] },
  "u-finance": { email: "fin@lakeze.com", roles: [{ role: "finance", accommodation_id: null }] },
  "u-am": { email: "am@lakeze.com", roles: [{ role: "am", accommodation_id: null }] },
  "u-scoutmgr": { email: "sm@lakeze.com", roles: [{ role: "scout_manager", accommodation_id: null }] },
  "u-closer": { email: "closer@lakeze.com", roles: [{ role: "closer", accommodation_id: null }] },
  "u-hadmin": { email: "hadmin@a.tw", roles: [{ role: "admin", accommodation_id: A }] },
};

const FIXTURES: Record<string, any[]> = {
  user_roles: Object.entries(PERSONAS).flatMap(([user_id, p]) => p.roles.map((r) => ({ user_id, ...r }))),
  orders: [
    { id: "o-a-cancel", order_number: "A001", guest_name: "王小明", guest_email: "guest-a@example.org", check_in_date: "2026-11-01", check_out_date: "2026-11-02", meal_plan: null, order_status: "cancelled", accommodation_id: A, room_type_id: "rt-a" },
    { id: "o-a-active", order_number: "A002", guest_name: "李小華", guest_email: "guest-a2@example.org", check_in_date: "2026-11-03", check_out_date: "2026-11-04", meal_plan: null, order_status: "confirmed", accommodation_id: A, room_type_id: "rt-a" },
    { id: "o-b-cancel", order_number: "B001", guest_name: "陳大同", guest_email: "guest-b@example.org", check_in_date: "2026-11-05", check_out_date: "2026-11-06", meal_plan: null, order_status: "cancelled", accommodation_id: B, room_type_id: "rt-b" },
  ],
  accommodation_info: [{ id: A, name: "測試A館", phone: "02-1", email: "a@a.tw" }, { id: B, name: "測試B館", phone: "02-2", email: "b@b.tw" }],
  room_types: [{ id: "rt-a", name: "雙人房" }, { id: "rt-b", name: "四人房" }],
  staff_module_permissions: [{ user_id: "u-staff", accommodation_id: A, module_key: "orders", permission_level: "editable" }],
};
export const AUTH_USERS = Object.entries(PERSONAS).map(([id, p]) => ({ id, email: p.email, user_metadata: {} }));

function builder(table: string) {
  const filters: ((r: any) => boolean)[] = [];
  let op = "select";
  let single = false;
  const b: any = {
    select: () => b, limit: () => b, order: () => b, gte: () => b, lte: () => b, lt: () => b, gt: () => b, neq: () => b, not: () => b, range: () => b, or: () => b,
    eq: (c: string, v: unknown) => { filters.push((r) => !(c in r) || r[c] === v); return b; },
    is: (c: string, v: unknown) => { filters.push((r) => !(c in r) || r[c] === v); return b; },
    in: (c: string, vs: unknown[]) => { filters.push((r) => !(c in r) || vs.includes(r[c])); return b; },
    insert: () => { op = "insert"; return b; },
    update: () => { op = "update"; return b; },
    upsert: () => { op = "upsert"; return b; },
    delete: () => { op = "delete"; return b; },
    maybeSingle: () => { single = true; return b; },
    single: () => { single = true; return b; },
    then: (res: any, rej: any) => {
      calls.push(`${op}:${table}`);
      const rows = op === "select" ? (FIXTURES[table] ?? []).filter((r) => filters.every((f) => f(r))) : [{ id: "new-1" }];
      return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null, count: rows.length }).then(res, rej);
    },
  };
  return b;
}

export function createClient(_url: string, _key: string, opts: any = {}) {
  const hdr = String(opts?.global?.headers?.Authorization ?? "").replace(/^Bearer\s+/i, "");
  const userOf = (t: string) => (PERSONAS[t] ? { id: t, email: PERSONAS[t].email } : null);
  return {
    from: (t: string) => builder(t),
    rpc: async (fn: string) => {
      calls.push(`rpc:${fn}`);
      if (fn === "is_admin_or_super") return { data: (PERSONAS[hdr]?.roles ?? []).some((r) => ["super_admin", "hotel_admin"].includes(r.role)), error: null };
      return { data: {}, error: null };
    },
    auth: {
      getUser: async (jwt?: string) => {
        const u = userOf(jwt ?? hdr);
        return { data: { user: u }, error: u ? null : { message: "invalid" } };
      },
    },
  };
}
