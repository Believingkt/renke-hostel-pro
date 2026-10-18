// 舊資料清理 步驟 2：用前端同一套拆分規則（lib/kolLinks.ts）產生預覽檔與執行 SQL，本身不連資料庫。
// 用法：bash docs/kol-1/legacy-links/build.sh <scan.json> [輸出資料夾]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KOL_LINK_PLATFORM_LABEL, kolLinkPlatform, mergeKolLinks, splitKolLinks } from "@/lib/kolLinks";
import { igProfileUrl, isContentPostUrl, normalizeIgHandle } from "@/lib/kolInviteValidation";

type ScanRow = {
  id: string;
  name: string | null;
  venue: string | null;
  check_in_date: string | null;
  is_error: boolean | null;
  ig_handle: string | null;
  ig_url: string | null;
  other_links: string[] | null;
};

type PlanRow = ScanRow & { status: string; newIg: string; newUrl: string | null; newOther: string[] };

const [input, outArg] = process.argv.slice(2);
if (!input) throw new Error("請指定 scan.json");
const outDir = outArg ?? join(process.cwd(), "out");

const loadScan = (path: string): ScanRow[] => {
  let data = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "").trim());
  // 也接受 SQL Editor 匯出的 [{ "scan_json": ... }]
  if (Array.isArray(data) && data.length === 1 && data[0] && "scan_json" in data[0]) {
    data = typeof data[0].scan_json === "string" ? JSON.parse(data[0].scan_json) : data[0].scan_json;
  }
  if (!Array.isArray(data)) throw new Error("scan.json 格式不對：應為陣列");
  return data;
};

const plan = (r: ScanRow): PlanRow => {
  const oldOther = r.other_links ?? [];
  const s = splitKolLinks(r.ig_handle ?? "");
  const base = { ...r, newIg: r.ig_handle ?? "", newUrl: r.ig_url, newOther: oldOther };
  if (!s.split) return { ...base, status: "略過：不需拆分" };
  const newIg = isContentPostUrl(s.primary) ? igProfileUrl(s.primary) || s.primary : normalizeIgHandle(s.primary);
  if (!newIg) return { ...base, status: "略過：拆不出主連結，請人工處理" };
  const newOther = mergeKolLinks(oldOther, s.others, s.primary);
  const newUrl = igProfileUrl(s.primary) || null;
  if (newIg === r.ig_handle && newUrl === r.ig_url && newOther.join("\n") === oldOther.join("\n")) {
    return { ...base, status: "略過：內容不變" };
  }
  const noIg = kolLinkPlatform(s.primary) !== "instagram";
  return { ...r, newIg, newUrl, newOther, status: noIg ? "會更新（沒有 IG，請確認主連結）" : "會更新" };
};

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const sqlText = (v: string | null) => (v == null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const sqlArr = (a: string[]) => `ARRAY[${a.map(sqlText).join(", ")}]::text[]`;

const rows = loadScan(input).map(plan);
const todo = rows.filter((r) => r.status.startsWith("會更新"));
mkdirSync(outDir, { recursive: true });

const header = ["狀態", "KOL 名稱", "館別", "入住日", "已標記錯誤", "原本主欄位", "新主欄位（帳號）", "新主連結", "其他平台連結", "id"];
const csv = [
  header.map(csvCell).join(","),
  ...rows.map((r) =>
    [
      r.status,
      r.name,
      r.venue,
      r.check_in_date,
      r.is_error ? "是" : "",
      r.ig_handle,
      r.newIg,
      r.newUrl,
      r.newOther.map((l) => `${KOL_LINK_PLATFORM_LABEL[kolLinkPlatform(l)]} ${l}`).join("\n"),
      r.id,
    ]
      .map(csvCell)
      .join(","),
  ),
].join("\r\n");
writeFileSync(join(outDir, "preview.csv"), `\uFEFF${csv}`);

if (todo.length > 0) {
  const values = todo
    .map((r) => `  (${sqlText(r.id)}::uuid, ${sqlText(r.ig_handle)}, ${sqlArr(r.other_links ?? [])}, ${sqlText(r.newIg)}, ${sqlText(r.newUrl)}, ${sqlArr(r.newOther)})`)
    .join(",\n");
  const template = readFileSync(join(process.env.KOL_LEGACY_DIR ?? ".", "02_apply.template.sql"), "utf8");
  const sql = template
    .replace("__GENERATED_AT__", () => new Date().toISOString())
    .replace("__COUNT__", () => String(todo.length))
    .replace("__VALUES__", () => values);
  writeFileSync(join(outDir, "02_apply.sql"), sql);
}

const tally = rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});
console.log(`掃描 ${rows.length} 筆`);
for (const [k, v] of Object.entries(tally)) console.log(`  ${k}：${v} 筆`);
console.log(`預覽：${join(outDir, "preview.csv")}`);
console.log(todo.length > 0 ? `執行 SQL：${join(outDir, "02_apply.sql")}` : "沒有需要更新的資料，未產生 02_apply.sql");
