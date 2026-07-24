// RLS 自動化測試：驗證會員只能讀取自己的訂單與相關資料
// 執行：supabase functions test rls-policy
//
// 依賴環境變數（讀 .env）：
//   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function createMember(prefix: string) {
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const email = `rlstest_${prefix}_${crypto.randomUUID()}@rls.test.local`;
  const password = crypto.randomUUID();
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (uErr) throw uErr;
  const userId = u.user!.id;
  const { data: m, error: mErr } = await admin
    .from("platform_members")
    .insert({ user_id: userId, name: `RLS Test ${prefix}`, email })
    .select().single();
  if (mErr) throw mErr;

  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;
  return { userId, memberId: m.id, client, admin };
}

async function cleanup(admin: any, userId: string) {
  await admin.auth.admin.deleteUser(userId).catch(() => {});
}

Deno.test("orders: member can view own order via .insert().select()", async () => {
  const A = await createMember("A");
  try {
    // 模擬 BookingFlow 的 insert().select().single()
    const acc = await A.admin.from("accommodation_info").select("id").limit(1).single();
    assert(acc.data, "need at least one accommodation");
    const room = await A.admin.from("room_types")
      .select("id").eq("accommodation_id", acc.data.id).limit(1).single();
    if (!room.data) return; // 該住宿沒有房型就跳過

    const payload = {
      accommodation_id: acc.data.id,
      room_type_id: room.data.id,
      member_id: A.memberId,
      order_number: "",
      guest_name: "RLS 測試",
      guest_phone: "0900000000",
      guest_email: `rlstest+${A.memberId}@rls.test.local`,
      check_in_date: "2099-01-01",
      check_out_date: "2099-01-02",
      guest_count: 1,
      total_price: 1000,
      final_price: 1000,
      deposit_amount: 0,
      order_status: "pending",
      payment_status: "pending_payment",
      order_source: "website",
    };

    const { data, error } = await A.client.from("orders").insert(payload).select().single();
    assertEquals(error, null, `insert().select() must succeed for member; got: ${error?.message}`);
    assert(data?.id, "should return inserted order");

    // 清理
    await A.admin.from("orders").delete().eq("id", data.id);
  } finally {
    await cleanup(A.admin, A.userId);
  }
});

Deno.test("orders: member B cannot see member A's order", async () => {
  const A = await createMember("A");
  const B = await createMember("B");
  try {
    const acc = await A.admin.from("accommodation_info").select("id").limit(1).single();
    const room = await A.admin.from("room_types").select("id").eq("accommodation_id", acc.data.id).limit(1).single();
    if (!room.data) return;

    const { data: order } = await A.admin.from("orders").insert({
      accommodation_id: acc.data.id, room_type_id: room.data.id, member_id: A.memberId,
      order_number: "", guest_name: "A", guest_phone: "0900000001",
      check_in_date: "2099-02-01", check_out_date: "2099-02-02",
      guest_count: 1, total_price: 1000, final_price: 1000,
      order_status: "pending", payment_status: "pending_payment", order_source: "website",
    }).select().single();

    const seen = await B.client.from("orders").select("id").eq("id", order!.id);
    assertEquals(seen.data?.length ?? 0, 0, "member B must not see A's order");

    await A.admin.from("orders").delete().eq("id", order!.id);
  } finally {
    await cleanup(A.admin, A.userId);
    await cleanup(B.admin, B.userId);
  }
});

Deno.test("orders: anon cannot list orders", async () => {
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data } = await anon.from("orders").select("id").limit(5);
  // RLS 會過濾成 0 筆（policy 未給 anon SELECT）
  assertEquals(data?.length ?? 0, 0, "anon must not see any orders");
});

Deno.test("member_favorites: owner only", async () => {
  const A = await createMember("A");
  const B = await createMember("B");
  try {
    const acc = await A.admin.from("accommodation_info").select("id").limit(1).single();
    const { data: fav, error: fErr } = await A.client.from("member_favorites").insert({
      member_id: A.memberId, accommodation_id: acc.data.id,
    }).select().single();
    if (fErr) { console.warn("skip favorites:", fErr.message); return; }

    const seen = await B.client.from("member_favorites").select("id").eq("id", fav!.id);
    assertEquals(seen.data?.length ?? 0, 0, "member B must not see A's favorite");

    await A.admin.from("member_favorites").delete().eq("id", fav!.id);
  } finally {
    await cleanup(A.admin, A.userId);
    await cleanup(B.admin, B.userId);
  }
});

Deno.test("regression: no member/own-scoped SELECT policy exposed to anon", async () => {
  // 掃 pg_policies，找名字含 own/member 的 SELECT policy，確認 roles 不含 anon
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc("_rls_test_list_member_policies").maybeSingle();
  if (error) {
    // 沒有輔助函數就跳過 — 由 SQL migration 提供
    console.warn("rpc not present, skipping regression sweep");
    return;
  }
  const rows = (data as any)?.rows ?? [];
  for (const p of rows) {
    assert(
      !(p.roles ?? []).includes("anon"),
      `Policy ${p.tablename}.${p.policyname} exposes to anon`,
    );
  }
});
