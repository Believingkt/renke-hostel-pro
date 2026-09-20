// 暫時性函式：部署在「舊」專案（Lovable Cloud）端，讓遷移腳本能列出 storage 物件並取得簽名下載網址。
// 只讀不寫。授權：header x-migration-key 必須等於 secret MIGRATION_KEY。遷移完成後刪除此函式與 secret。
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-migration-key",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const key = Deno.env.get("MIGRATION_KEY");
  if (!key || req.headers.get("x-migration-key") !== key) return json({ error: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  if (action === "buckets") {
    const { data, error } = await admin.storage.listBuckets();
    if (error) return json({ error: error.message }, 500);
    return json({ buckets: data });
  }

  if (action === "list") {
    // 用 storage SDK 遞迴列目錄（storage.objects 不在 PostgREST 開放的 schema 內）
    const { bucket, prefix = "", updatedAfter } = body as { bucket: string; prefix?: string; updatedAfter?: string };
    const out: { name: string; updated_at: string; size: number | null; mimetype: string | null }[] = [];
    const walk = async (dir: string) => {
      let offset = 0;
      while (true) {
        const { data, error } = await admin.storage.from(bucket).list(dir, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
        if (error) throw new Error(`list ${bucket}/${dir}: ${error.message}`);
        for (const e of data ?? []) {
          const full = dir ? `${dir}/${e.name}` : e.name;
          if (e.id === null) { await walk(full); continue; } // 目錄
          if (updatedAfter && e.updated_at && e.updated_at <= updatedAfter) continue;
          out.push({ name: full, updated_at: e.updated_at ?? "", size: e.metadata?.size ?? null, mimetype: e.metadata?.mimetype ?? null });
        }
        if (!data || data.length < 1000) break;
        offset += 1000;
      }
    };
    try { await walk(prefix); } catch (e) { return json({ error: (e as Error).message }, 500); }
    return json({ objects: out, next: null });
  }

  if (action === "sign") {
    const { bucket, names } = body as { bucket: string; names: string[] };
    if (!Array.isArray(names) || names.length > 200) return json({ error: "names: max 200" }, 400);
    const { data, error } = await admin.storage.from(bucket).createSignedUrls(names, 3600);
    if (error) return json({ error: error.message }, 500);
    return json({ urls: data });
  }

  return json({ error: "unknown action (buckets|list|sign)" }, 400);
});
