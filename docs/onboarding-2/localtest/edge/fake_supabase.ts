// 本機測試用假 Supabase client：user_roles 依 token 對應的身分回傳；其餘表回傳固定測試資料
export const calls: string[] = [];

export const ACC_A = "aaaaaaaa-0000-0000-0000-00000000000a";
export const ACC_B = "bbbbbbbb-0000-0000-0000-00000000000b";
export const ACC_C = "cccccccc-0000-0000-0000-00000000000c";

export const PERSONAS: Record<string, { email: string; roles: { role: string; accommodation_id: string | null }[] }> = {
  "u-owner-single": { email: "owner@a.tw", roles: [{ role: "hotel_admin", accommodation_id: ACC_A }, { role: "owner", accommodation_id: ACC_A }] },
  "u-internal-multi": {
    email: "staff@lakeze.com",
    roles: [ACC_A, ACC_B, ACC_C].map((id) => ({ role: "hotel_admin", accommodation_id: id })),
  },
  "u-hotel-scoped-admin": { email: "hadmin@a.tw", roles: [{ role: "admin", accommodation_id: ACC_A }] },
  "u-super": { email: "super@lakeze.com", roles: [{ role: "super_admin", accommodation_id: null }] },
  "u-team-admin": { email: "teamadmin@lakeze.com", roles: [{ role: "admin", accommodation_id: null }] },
};

const FIXTURES: Record<string, any[]> = {
  remarketing_campaigns: [{
    id: "camp-1", name: "回訪測試", channel: "email", status: "draft", segment: { rules: [] },
    content: { subject: "想念你", body: "嗨 {name}，歡迎回來", cta_text: "看看", cta_url: "https://lakeze.com" },
    recommend_products: [],
  }],
  traveler_profiles: [{ id: "tp-1", display_name: "王小明", email: "traveler@example.org", phone: null, interest_tags: [], custom_needs: null, consumption: {}, updated_at: null, customer_key: "email:traveler@example.org" }],
};

function builder(table: string, token: string) {
  const filters: [string, unknown][] = [];
  let op = "select";
  let single = false;
  const b: any = {
    select: () => b, in: () => b, limit: () => b, order: () => b, gte: () => b, lte: () => b, neq: () => b,
    eq: (c: string, v: unknown) => { filters.push([c, v]); return b; },
    insert: () => { op = "insert"; return b; },
    update: () => { op = "update"; return b; },
    upsert: () => { op = "upsert"; return b; },
    maybeSingle: () => { single = true; return b; },
    single: () => { single = true; return b; },
    then: (res: any, rej: any) => {
      calls.push(`${op}:${table}`);
      let rows: any[];
      if (table === "user_roles") {
        const uid = filters.find(([c]) => c === "user_id")?.[1] as string;
        rows = PERSONAS[uid]?.roles ?? [];
      } else if (op === "insert") {
        rows = [{ id: "send-1" }];
      } else {
        rows = (FIXTURES[table] ?? []).filter((r) => filters.every(([c, v]) => !(c in r) || r[c] === v));
      }
      return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(res, rej);
    },
  };
  return b;
}

export function createClient(_url: string, _key: string, opts: any = {}) {
  const auth = String(opts?.global?.headers?.Authorization ?? "").replace(/^Bearer\s+/i, "");
  return {
    from: (t: string) => builder(t, auth),
    auth: {
      getUser: async () => {
        const p = PERSONAS[auth];
        return { data: { user: p ? { id: auth, email: p.email } : null }, error: null };
      },
    },
  };
}
