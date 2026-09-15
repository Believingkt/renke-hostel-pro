import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const EMAIL = "appreview@lakeze.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const seedKey = Deno.env.get("APP_REVIEW_SEED_KEY");
    if (!seedKey || req.headers.get("x-seed-key") !== seedKey) {
      return json({ error: "unauthorized" }, 401);
    }

    const password = Deno.env.get("APP_REVIEW_PASSWORD");
    if (!password) return json({ error: "APP_REVIEW_PASSWORD not configured" }, 500);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // 1) 建立或取得審核測試帳號（Email 直接視為已驗證）
    let userId: string | null = null;
    const created = await admin.auth.admin.createUser({
      email: EMAIL,
      password,
      email_confirm: true,
      user_metadata: { name: "App Review 測試帳號", is_test_account: true },
    });

    if (created.error) {
      // 已存在 → 找出既有使用者並重設密碼
      let page = 1;
      while (!userId && page <= 20) {
        const list = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (list.error) return json({ error: list.error.message }, 500);
        userId = list.data.users.find((u) => u.email?.toLowerCase() === EMAIL)?.id ?? null;
        if (list.data.users.length < 200) break;
        page += 1;
      }
      if (!userId) return json({ error: created.error.message }, 500);
      const upd = await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: { name: "App Review 測試帳號", is_test_account: true },
      });
      if (upd.error) return json({ error: upd.error.message }, 500);
    } else {
      userId = created.data.user!.id;
    }

    // 2) 種入會員資料、點數與示範訂單（不觸發任何業務副作用）
    const { data, error } = await admin.rpc("seed_app_review_account", {
      p_user_id: userId,
      p_email: EMAIL,
    });
    if (error) return json({ error: error.message }, 500);

    return json({ success: true, email: EMAIL, user_id: userId, seeded: data });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
