#!/usr/bin/env node
/**
 * 人客多 Supabase 發布腳本（migration + edge function）
 *
 * 用途：在 Emergent 主系統（或任何有 supabase CLI / npx 的環境）把 supabase/ 底下的變更發布到正式專案。
 *   1. migration：列出尚未套用的 migration；預設只「列出並停下」，要加 --migrations=apply 才真的套用。
 *   2. edge function：比對每支 function（含其 import 的 _shared 檔、config.toml 的 verify_jwt 設定）的內容雜湊，
 *      只部署有變動的；雜湊記錄在 supabase/.release/functions.json，發布成功後更新。
 *
 * 用法：
 *   node scripts/release/supabase-release.mjs [--migrations=confirm|apply|skip] [--functions=all|changed|none|a,b,c] [--dry-run]
 *
 * 環境變數：
 *   SUPABASE_ACCESS_TOKEN   必要（部署 function、連結專案）
 *   SUPABASE_DB_PASSWORD    套用 migration 時必要（直接用資料庫連線，不需要 supabase link，token 不必有專案設定權限）
 *   SUPABASE_PROJECT_REF    預設 opaphdargymfyrrzvozs（正式）
 *   SUPABASE_DB_REGION      連線池區域，預設 ap-northeast-1（Tokyo）
 *   SUPABASE_DB_URL         若設定則直接使用，忽略上面三個
 *   SUPABASE_CLI            預設 "npx -y supabase@2.117.0"；本機有裝可設 "supabase"
 *
 * 結束碼：0 成功；3 = 有待確認的 migration（confirm 模式）；其他 = 失敗
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve, relative, posix } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FN_DIR = join(ROOT, "supabase", "functions");
const SHARED = join(FN_DIR, "_shared");
const MANIFEST = join(ROOT, "supabase", ".release", "functions.json");
const CONFIG = join(ROOT, "supabase", "config.toml");
const DEFAULT_REF = "opaphdargymfyrrzvozs";

// ---------- 參數 ----------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? "true"] : [a, "true"];
  }),
);
const MIGRATIONS = args.migrations ?? "confirm"; // confirm | apply | skip
const FUNCTIONS = args.functions ?? "changed"; // all | changed | none | a,b,c
const DRY = args["dry-run"] === "true";
const REF = process.env.SUPABASE_PROJECT_REF || DEFAULT_REF;
const CLI = (process.env.SUPABASE_CLI || "npx -y supabase@2.117.0").split(" ");

if (!["confirm", "apply", "skip"].includes(MIGRATIONS)) die(`--migrations 只接受 confirm|apply|skip，收到：${MIGRATIONS}`);
if (!process.env.SUPABASE_ACCESS_TOKEN) die("缺少環境變數 SUPABASE_ACCESS_TOKEN");

log(`專案：${REF}${REF === DEFAULT_REF ? "（正式）" : "（非正式）"}  migrations=${MIGRATIONS}  functions=${FUNCTIONS}${DRY ? "  [dry-run]" : ""}`);

// ---------- 工具 ----------
function log(s) { console.log(`[release] ${s}`); }
function die(s, code = 1) { console.error(`[release] 錯誤：${s}`); process.exit(code); }
function run(cmd, opts = {}) {
  const [bin, ...rest] = cmd;
  const r = spawnSync(bin, rest, { cwd: ROOT, encoding: "utf8", env: process.env, stdio: opts.capture ? "pipe" : "inherit", shell: process.platform === "win32" });
  if (r.error) die(`${cmd.join(" ")}：${r.error.message}`);
  if (r.status !== 0 && !opts.allowFail) die(`${redact(cmd.join(" "))} 回傳 ${r.status}${r.stderr ? "\n" + redact(r.stderr) : ""}`);
  return r;
}
const sb = (...a) => [...CLI, ...a];
// 錯誤訊息裡把密碼遮掉，避免印到畫面
function redact(s) { const pw = process.env.SUPABASE_DB_PASSWORD; return pw ? String(s).split(pw).join("***").split(encodeURIComponent(pw)).join("***") : String(s); }
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out.sort();
}
const sha = (s) => createHash("sha256").update(s).digest("hex");

// ---------- 1. migration ----------
let pendingMigrations = [];
if (MIGRATIONS !== "skip") {
  if (!process.env.SUPABASE_DB_PASSWORD && !process.env.SUPABASE_DB_URL) die("migrations=confirm/apply 需要 SUPABASE_DB_PASSWORD（要跳過請用 --migrations=skip）");
  // 不用 supabase link（需要 project_admin_read 權限），直接用資料庫連線字串（session pooler，port 5432）
  const region = process.env.SUPABASE_DB_REGION || "ap-northeast-1";
  const dbUrl = process.env.SUPABASE_DB_URL || `postgresql://postgres.${REF}:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@aws-0-${region}.pooler.supabase.com:5432/postgres`;
  const list = run(sb("migration", "list", "--db-url", dbUrl), { capture: true });
  // 表格欄位：Local | Remote | Time；Remote 空白 = 尚未套用
  for (const line of (list.stdout || "").split("\n")) {
    const m = line.match(/^\s*(\d{14})\s*\|\s*(\d{14})?\s*\|/);
    if (m && !m[2]) pendingMigrations.push(m[1]);
  }
  if (pendingMigrations.length === 0) {
    log("migration：沒有待套用的項目");
  } else {
    const files = readdirSync(join(ROOT, "supabase", "migrations")).filter((f) => pendingMigrations.some((v) => f.startsWith(v)));
    log(`migration：${files.length} 個待套用`);
    for (const f of files) {
      console.log(`\n===== supabase/migrations/${f} =====`);
      console.log(readFileSync(join(ROOT, "supabase", "migrations", f), "utf8"));
    }
    if (MIGRATIONS === "confirm") {
      console.log(`\n[release] 以上 migration 尚未套用。請確認內容無誤後，改用 --migrations=apply 重新執行；若不打算套用請用 --migrations=skip。`);
      process.exit(3);
    }
    if (DRY) log("dry-run：略過 db push");
    else {
      run(sb("db", "push", "--db-url", dbUrl));
      log("migration：已套用");
    }
  }
}

// ---------- 2. edge function ----------
if (FUNCTIONS !== "none") {
  if (!existsSync(FN_DIR)) die(`找不到 ${FN_DIR}`);
  const config = existsSync(CONFIG) ? readFileSync(CONFIG, "utf8") : "";
  const fnNames = readdirSync(FN_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith("."))
    .map((e) => e.name)
    .filter((n) => existsSync(join(FN_DIR, n, "index.ts")) || existsSync(join(FN_DIR, n, "index.tsx")))
    .sort();

  // import 圖：每個檔案 import 了哪些本地檔（只追 ./ 與 ../ 相對路徑）
  const importCache = new Map();
  function localImports(file) {
    if (importCache.has(file)) return importCache.get(file);
    const src = readFileSync(file, "utf8");
    const out = new Set();
    const re = /(?:from|import)\s*\(?\s*["']((?:\.\.?\/)[^"']+)["']/g;
    let m;
    while ((m = re.exec(src))) {
      const p = resolve(dirname(file), m[1]);
      if (existsSync(p) && statSync(p).isFile()) out.add(p);
    }
    importCache.set(file, out);
    return out;
  }
  function closure(files) {
    const seen = new Set();
    const stack = [...files];
    while (stack.length) {
      const f = stack.pop();
      if (seen.has(f)) continue;
      seen.add(f);
      for (const d of localImports(f)) stack.push(d);
    }
    return [...seen].sort();
  }
  function fnHash(name) {
    const own = walk(join(FN_DIR, name)).filter((f) => !f.includes("/node_modules/"));
    const all = closure(own);
    const h = createHash("sha256");
    for (const f of all) h.update(relative(ROOT, f).split("\\").join("/")).update("\0").update(readFileSync(f)).update("\0");
    const cfg = config.match(new RegExp(`\\[functions\\.${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\][^\\[]*`));
    h.update(cfg ? cfg[0] : "");
    return h.digest("hex");
  }

  const prev = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { functions: {} };
  const current = Object.fromEntries(fnNames.map((n) => [n, fnHash(n)]));

  let toDeploy;
  if (FUNCTIONS === "all") toDeploy = fnNames;
  else if (FUNCTIONS === "changed") {
    if (!existsSync(MANIFEST)) {
      log(`找不到 ${relative(ROOT, MANIFEST)}（第一次執行），將部署全部 ${fnNames.length} 支`);
      toDeploy = fnNames;
    } else toDeploy = fnNames.filter((n) => prev.functions[n] !== current[n]);
  } else {
    toDeploy = FUNCTIONS.split(",").map((s) => s.trim()).filter(Boolean);
    const bad = toDeploy.filter((n) => !fnNames.includes(n));
    if (bad.length) die(`找不到 function：${bad.join(", ")}`);
  }

  if (toDeploy.length === 0) log("edge function：沒有變動，不需部署");
  else {
    log(`edge function：將部署 ${toDeploy.length} 支：${toDeploy.join(" ")}`);
    if (DRY) log("dry-run：略過 functions deploy");
    else {
      // 分批，避免單次參數過長／單次失敗全部重來
      const BATCH = 20;
      for (let i = 0; i < toDeploy.length; i += BATCH) {
        const batch = toDeploy.slice(i, i + BATCH);
        run(sb("functions", "deploy", ...batch, "--project-ref", REF));
        // 每批成功就更新 manifest，中途失敗也不會重部署已完成的
        for (const n of batch) prev.functions[n] = current[n];
        writeManifest(prev);
      }
      log("edge function：部署完成");
    }
  }
  if (!DRY) {
    // 移除已不存在的 function 紀錄（線上 function 不會自動刪除，請手動處理）
    for (const n of Object.keys(prev.functions)) if (!fnNames.includes(n)) delete prev.functions[n];
    writeManifest(prev);
  }
}

function writeManifest(m) {
  mkdirSync(dirname(MANIFEST), { recursive: true });
  const sorted = { note: "由 scripts/release/supabase-release.mjs 維護：每支 edge function（含其 import 的 _shared 檔與 config.toml 設定）最後一次部署時的內容雜湊。請勿手動編輯。", projectRef: REF, updatedAt: new Date().toISOString(), functions: Object.fromEntries(Object.entries(m.functions).sort()) };
  writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + "\n");
}
log("完成");
