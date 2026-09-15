import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveMemberIdCore, type ResolveMemberIdDeps } from "./resolveMemberId.ts";

const SERVICE = "service-role-key";
const ANON = "anon-key";
const A_UID = "aaaaaaaa-0000-0000-0000-000000000001";
const A_MEMBER = "11111111-0000-0000-0000-000000000001";
const B_MEMBER = "22222222-0000-0000-0000-000000000002";

const deps: ResolveMemberIdDeps = {
  serviceKey: SERVICE,
  anonKey: ANON,
  getUserId: (token) => Promise.resolve(token === "A-JWT" ? A_UID : null),
  getMemberIdByUserId: (uid) => Promise.resolve(uid === A_UID ? A_MEMBER : null),
};

Deno.test("T4-1 訪客帶 anon key 塞 B 的 id → null", async () => {
  assertEquals(await resolveMemberIdCore(`Bearer ${ANON}`, B_MEMBER, deps), null);
});

Deno.test("T4-2 無 Authorization header → null", async () => {
  assertEquals(await resolveMemberIdCore(null, B_MEMBER, deps), null);
});

Deno.test("T4-3 會員 A 冒充 B → 改回 A 自己的 id", async () => {
  assertEquals(await resolveMemberIdCore("Bearer A-JWT", B_MEMBER, deps), A_MEMBER);
});

Deno.test("T4-4 會員 A 帶自己的 id → 原值（不誤傷）", async () => {
  assertEquals(await resolveMemberIdCore("Bearer A-JWT", A_MEMBER, deps), A_MEMBER);
});

Deno.test("T4-5 service_role 補單 → 沿用原值", async () => {
  assertEquals(await resolveMemberIdCore(`Bearer ${SERVICE}`, A_MEMBER, deps), A_MEMBER);
});

Deno.test("T4-6 未帶 memberId → null", async () => {
  assertEquals(await resolveMemberIdCore("Bearer A-JWT", null, deps), null);
  assertEquals(await resolveMemberIdCore(`Bearer ${SERVICE}`, undefined, deps), null);
});

Deno.test("T4-7 無效 token → null", async () => {
  assertEquals(await resolveMemberIdCore("Bearer garbage", B_MEMBER, deps), null);
});
