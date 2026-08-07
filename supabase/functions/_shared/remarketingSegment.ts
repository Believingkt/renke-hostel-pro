// E2 再行銷分群條件解析（旅客行為洞察）
// segment: { dimension: 'preference'|'consumption'|'potential', rules: [{ field, op, value }] }
// deno-lint-ignore-file no-explicit-any

export type SegmentRule = { field: string; op: string; value: unknown };
export type Segment = { dimension?: string; rules?: SegmentRule[]; match?: "all" | "any" };

export type TravelerRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  interest_tags: string[] | null;
  custom_needs: string[] | null;
  consumption: Record<string, any> | null;
  updated_at?: string | null;
};

const daysSince = (iso: unknown): number | null => {
  if (typeof iso !== "string" || !iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
};

const num = (v: unknown): number => Number(v ?? 0) || 0;

function fieldValue(p: TravelerRow, field: string): unknown {
  const c = p.consumption ?? {};
  switch (field) {
    case "interest_tags":
      return p.interest_tags ?? [];
    case "custom_needs":
      return p.custom_needs ?? [];
    case "total_amount":
      return num(c.total_amount);
    case "order_count":
      return num(c.order_count);
    case "avg_amount":
      return num(c.avg_amount);
    case "days_since_last_order":
      return daysSince(c.last_order_at);
    case "has_email":
      return !!p.email;
    default:
      return null;
  }
}

function matchRule(p: TravelerRow, rule: SegmentRule): boolean {
  const actual = fieldValue(p, rule.field);
  const op = rule.op;
  const expected = rule.value;

  if (Array.isArray(actual)) {
    const list = actual.map((x) => String(x).toLowerCase());
    const wanted = (Array.isArray(expected) ? expected : [expected])
      .map((x) => String(x ?? "").trim().toLowerCase())
      .filter(Boolean);
    if (!wanted.length) return true;
    const hit = wanted.some((w) => list.some((l) => l.includes(w)));
    return op === "not_contains" ? !hit : hit;
  }

  if (typeof actual === "boolean") {
    return op === "is_false" ? !actual : actual;
  }

  if (actual === null) {
    // 沒有消費紀錄：只有「未回訪天數」類條件視為命中（從未下單 = 潛在回流）
    return rule.field === "days_since_last_order" && (op === "gt" || op === "gte");
  }

  const a = Number(actual);
  const b = Number(expected ?? 0);
  switch (op) {
    case "gt": return a > b;
    case "gte": return a >= b;
    case "lt": return a < b;
    case "lte": return a <= b;
    case "eq": return a === b;
    default: return false;
  }
}

export function matchSegment(p: TravelerRow, segment: Segment | null | undefined): boolean {
  const rules = Array.isArray(segment?.rules) ? segment!.rules! : [];
  if (!rules.length) return true;
  const mode = segment?.match === "any" ? "any" : "all";
  return mode === "any" ? rules.some((r) => matchRule(p, r)) : rules.every((r) => matchRule(p, r));
}

export function summarizeSegment(segment: Segment | null | undefined): string {
  const rules = Array.isArray(segment?.rules) ? segment!.rules! : [];
  if (!rules.length) return "全部旅客";
  const label: Record<string, string> = {
    interest_tags: "興趣標籤",
    custom_needs: "客製需求",
    total_amount: "消費總額",
    order_count: "訂單數",
    avg_amount: "平均客單",
    days_since_last_order: "未回訪天數",
    has_email: "有 Email",
  };
  const opLabel: Record<string, string> = {
    contains: "包含", not_contains: "不包含",
    gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=",
    is_true: "是", is_false: "否",
  };
  return rules
    .map((r) => `${label[r.field] ?? r.field} ${opLabel[r.op] ?? r.op} ${Array.isArray(r.value) ? r.value.join("/") : String(r.value ?? "")}`.trim())
    .join(" 且 ");
}
