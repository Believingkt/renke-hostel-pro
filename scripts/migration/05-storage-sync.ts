// 把舊專案 storage 物件複製到新專案。跑在 Nokimi 的 Mac：
//   deno run -A 05-storage-sync.ts            # 全量（已存在且大小相同的略過）
//   deno run -A 05-storage-sync.ts --since 2026-09-22T00:00:00Z   # 增量（只抓 updated_at 之後的）
//   deno run -A 05-storage-sync.ts --bucket room-photos            # 單一 bucket
// 舊端不需要任何新專案的鑰匙；新端的 service role 只存在本機 migration.env。
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseArgs } from "node:util";

const fileEnv: Record<string, string> = {};
try {
  for (const line of (await Deno.readTextFile("./migration.env")).split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m) fileEnv[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no migration.env */ }
const env = { ...fileEnv, ...Deno.env.toObject() };
const need = (k: string) => env[k] || (() => { throw new Error(`migration.env 缺 ${k}`); })();
const OLD_FN = `https://${need("OLD_REF")}.supabase.co/functions/v1/migration-storage-sync`;
const KEY = need("MIGRATION_KEY");
const { values: args } = parseArgs({ args: Deno.args, options: { since: { type: "string" }, bucket: { type: "string" }, dry: { type: "boolean", default: false } } });
const newSb = createClient(`https://${need("NEW_REF")}.supabase.co`, need("NEW_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

type Obj = { name: string; updated_at: string; size: number | null; mimetype: string | null };
// deno-lint-ignore no-explicit-any
async function old(body: Record<string, unknown>): Promise<any> {
  const r = await fetch(OLD_FN, { method: "POST", headers: { "Content-Type": "application/json", "x-migration-key": KEY, "apikey": need("OLD_ANON_KEY") }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${body.action}: ${r.status} ${JSON.stringify(j)}`);
  return j;
}

const { buckets } = await old({ action: "buckets" });
const stats = { copied: 0, skipped: 0, failed: 0, bytes: 0 };
const failures: string[] = [];
for (const b of buckets) {
  if (args.bucket && b.name !== args.bucket) continue;
  // 新專案的 bucket 由 migration 建立；若沒有就照舊設定建
  const { data: nb } = await newSb.storage.getBucket(b.name);
  if (!nb) {
    console.log(`+ create bucket ${b.name} (public=${b.public})`);
    if (!args.dry) await newSb.storage.createBucket(b.name, { public: b.public, fileSizeLimit: b.file_size_limit ?? undefined, allowedMimeTypes: b.allowed_mime_types ?? undefined });
  }
  let after = "", total = 0;
  while (true) {
    const { objects, next } = await old({ action: "list", bucket: b.name, after, limit: 1000, updatedAfter: args.since });
    total += objects.length;
    for (let i = 0; i < objects.length; i += 100) {
      const chunk = objects.slice(i, i + 100);
      // 已存在且大小相同 → 略過
      const todo: Obj[] = [];
      for (const o of chunk as Obj[]) {
        const dir = o.name.includes("/") ? o.name.slice(0, o.name.lastIndexOf("/")) : "";
        const base = o.name.slice(dir.length ? dir.length + 1 : 0);
        const { data: ex } = await newSb.storage.from(b.name).list(dir, { search: base, limit: 1 });
        const hit = ex?.find((e) => e.name === base);
        if (hit && o.size != null && hit.metadata?.size === o.size) { stats.skipped++; continue; }
        todo.push(o);
      }
      if (!todo.length) continue;
      const { urls } = await old({ action: "sign", bucket: b.name, names: todo.map((o) => o.name) });
      await Promise.all(todo.map(async (o: Obj, k: number) => {
        const u = urls[k];
        if (!u?.signedUrl) { stats.failed++; failures.push(`${b.name}/${o.name}: no signed url`); return; }
        try {
          if (args.dry) { stats.copied++; return; }
          const res = await fetch(u.signedUrl);
          if (!res.ok) throw new Error(`download ${res.status}`);
          const blob = await res.blob();
          const { error } = await newSb.storage.from(b.name).upload(o.name, blob, { upsert: true, contentType: o.mimetype ?? blob.type ?? undefined });
          if (error) throw error;
          stats.copied++; stats.bytes += blob.size;
        } catch (e) { stats.failed++; failures.push(`${b.name}/${o.name}: ${(e as Error).message ?? e}`); }
      }));
      console.log(`${b.name}: ${Math.min(i + 100, objects.length)}/${objects.length}  copied=${stats.copied} skipped=${stats.skipped} failed=${stats.failed}`);
    }
    if (!next) break;
    after = next;
  }
  console.log(`== ${b.name}: ${total} objects listed`);
}
console.log(stats, `${(stats.bytes / 1e6).toFixed(1)} MB`);
if (failures.length) { await Deno.writeTextFile("storage-sync-failures.txt", failures.join("\n")); console.log(`失敗清單 → storage-sync-failures.txt（重跑即可續傳）`); Deno.exit(1); }
