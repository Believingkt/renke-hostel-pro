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
    // 用 storage.objects 直接查，避免遞迴 list 目錄；回傳 name/size/mimetype/updated_at
    const { bucket, after = "", limit = 1000, updatedAfter } = body;
    let q = admin
      .schema("storage")
      .from("objects")
      .select("name, updated_at, metadata")
      .eq("bucket_id", bucket)
      .gt("name", after)
      .order("name", { ascending: true })
      .limit(limit);
    if (updatedAfter) q = q.gt("updated_at", updatedAfter);
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({
      objects: (data ?? []).map((o) => ({
        name: o.name,
        updated_at: o.updated_at,
        size: o.metadata?.size ?? null,
        mimetype: o.metadata?.mimetype ?? null,
      })),
      next: data && data.length === limit ? data[data.length - 1].name : null,
    });
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
