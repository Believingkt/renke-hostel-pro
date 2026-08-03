/**
 * 共用：Ragic income-source 表單 API 呼叫邏輯。
 * 由 push-ragic-revenue 抽出，供 push-ragic-franchise-fee 共用。
 * 純 TypeScript，零外部 import。
 */

export const RAGIC_INCOME_URL =
  "https://ap15.ragic.com/lakeze/income-source/2?api&naming=EID";

/** income-source 表單欄位 EID 對照 */
export const RAGIC_FIELD = {
  DATA_SOURCE: "1001007",
  YEAR_MONTH: "1001009",
  BUSINESS_UNIT: "1001017",
  INCOME_TYPE: "1001018",
  AMOUNT: "1001010",
  VENUE: "1001008",
  COMMISSION_RATE: "1001019",
  COMMISSION_FEE: "1001020",
  NOTE: "1001022",
} as const;

export function ragicAuthHeader(): string {
  const apiKey = Deno.env.get("RAGIC_API_KEY");
  if (!apiKey) throw new Error("RAGIC_API_KEY not configured");
  return `Basic ${apiKey.trim()}`;
}

export interface RagicPostResult {
  ok: boolean;
  status: number;
  body: any;
}

/** POST 一筆資料到 Ragic（有 recordId 則為更新） */
export async function postToRagic(
  payload: Record<string, string>,
  recordId?: string | number | null,
): Promise<RagicPostResult> {
  const url =
    recordId != null && recordId !== ""
      ? RAGIC_INCOME_URL.replace("?api&naming=EID", `/${recordId}?api&naming=EID`)
      : RAGIC_INCOME_URL;
  const body = new URLSearchParams(payload).toString();
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: ragicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await resp.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* Ragic 偶爾回非 JSON，保留原文 */
  }
  return { ok: resp.ok, status: resp.status, body: json ?? text };
}

/**
 * 依 年月 + 事業單位/場館 + 收入類型 找既有紀錄，回傳 Ragic record id 或 null。
 * yyyyMm 格式為 "YYYY/MM"。
 */
export async function findExistingRagicRecord(
  yyyyMm: string,
  venueName: string,
  incomeType: string,
): Promise<string | null> {
  const [y, m] = yyyyMm.split("/");
  const dateVal = `${y}/${m}/01`;
  const params = new URLSearchParams();
  params.set("api", "");
  params.append("where", `${RAGIC_FIELD.YEAR_MONTH},eq,${dateVal}`);
  params.append("where", `${RAGIC_FIELD.VENUE},eq,${venueName}`);
  params.append("where", `${RAGIC_FIELD.INCOME_TYPE},eq,${incomeType}`);
  const url = `https://ap15.ragic.com/lakeze/income-source/2?${params.toString()}`;
  const resp = await fetch(url, { headers: { Authorization: ragicAuthHeader() } });
  if (!resp.ok) return null;
  const text = await resp.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  const keys = Object.keys(json).filter(
    (k) => !k.startsWith("_") && typeof json[k] === "object",
  );
  if (keys.length === 0) return null;
  const first = json[keys[0]];
  return String(first?._ragicId ?? keys[0]);
}

/** dry_run=false 時，依 mode 決定 upsert 或 insert，並回傳結果摘要 */
export async function pushRows(
  rows: Record<string, string>[],
  yyyyMm: string,
  mode: "insert" | "upsert",
): Promise<any[]> {
  const posts: any[] = [];
  for (const row of rows) {
    let existingId: string | null = null;
    if (mode === "upsert") {
      try {
        existingId = await findExistingRagicRecord(
          yyyyMm,
          row[RAGIC_FIELD.VENUE],
          row[RAGIC_FIELD.INCOME_TYPE],
        );
      } catch (err) {
        console.error("[ragic] lookup failed", err);
      }
    }
    const r = await postToRagic(row, existingId);
    const respRid = (r.body && (r.body._ragicId ?? r.body.ragicId)) ?? null;
    posts.push({
      ok: r.ok && (r.body?.status ?? "SUCCESS") === "SUCCESS",
      status: r.status,
      action: existingId ? "update" : "insert",
      existing_record_id: existingId,
      record_id: respRid ?? existingId,
      body: r.body,
    });
  }
  return posts;
}
