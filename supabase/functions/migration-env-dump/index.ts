// 暫時性函式：部署在「舊」專案（Lovable Cloud）端，把 Edge Function 的 secrets 一次讀出來給遷移用。
// Lovable 後台的 Secrets 只能新增/刪除、不能看值；但函式本身讀得到，這是唯一不用回各家後台重拿的方法。
// 授權：header x-migration-key 必須等於 secret MIGRATION_KEY（先在 Lovable 後台 Add secret）。
// 用完立刻刪除此函式與 MIGRATION_KEY。回傳內容只走 HTTPS，請直接存進密碼管理器，不要貼進聊天工具。
const HIDE = /^(SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|MIGRATION_KEY|DENO_.*|HOME|PATH|HOSTNAME|PWD|USER|TZ|LANG|SB_.*|EDGE_RUNTIME_.*)$/;

Deno.serve((req) => {
  const key = Deno.env.get("MIGRATION_KEY");
  if (!key || req.headers.get("x-migration-key") !== key) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "env";
  const env = Deno.env.toObject();
  const entries = Object.entries(env).filter(([k]) => !HIDE.test(k)).sort(([a], [b]) => a.localeCompare(b));
  if (format === "json") {
    return new Response(JSON.stringify(Object.fromEntries(entries), null, 2), { headers: { "Content-Type": "application/json" } });
  }
  // .env 格式：可直接存成 scripts/migration/secrets.env 給 01-set-secrets.sh 用
  const body = entries.map(([k, v]) => `${k}=${/[\s#"'\\]/.test(v) ? JSON.stringify(v) : v}`).join("\n") + "\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
});
