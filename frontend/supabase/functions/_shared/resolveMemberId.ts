// V5.5B.5 — orders.member_id 身分綁定
//
// 回傳「可安全寫入 orders.member_id」的值：
// - service_role 呼叫（tappay-notify 用草稿補單）→ 沿用傳入值（草稿在寫入時已驗過）
// - 合法使用者 JWT → 一律以 JWT 反查該使用者自己的 platform_members.id
//   （塞別人的 id 會被靜默改成自己的 id，而不是讓訂房失敗）
// - 其他（anon key／無 header／無效 token）→ null
//
// 注意：這裡刻意「修正」而非「拒絕」，因為這幾支函式都在真實付款流程上，
// 中斷會讓真客人付了錢卻沒有訂單。RLS 層（前端直接 insert）則是直接拒絕。

export interface ResolveMemberIdDeps {
  serviceKey: string | null;
  anonKey: string | null;
  getUserId: (token: string) => Promise<string | null>;
  getMemberIdByUserId: (userId: string) => Promise<string | null>;
}

export function extractBearer(authHeader: string | null | undefined): string {
  return (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
}

/** 純邏輯核心，便於單元測試 */
export async function resolveMemberIdCore(
  authHeader: string | null | undefined,
  requestedMemberId: string | null | undefined,
  deps: ResolveMemberIdDeps,
): Promise<string | null> {
  if (!requestedMemberId) return null;

  const token = extractBearer(authHeader);
  if (!token) return null;

  if (deps.serviceKey && token === deps.serviceKey) return requestedMemberId;
  if (deps.anonKey && token === deps.anonKey) return null;

  const userId = await deps.getUserId(token);
  if (!userId) return null;

  return await deps.getMemberIdByUserId(userId);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function resolveMemberId(
  req: Request,
  admin: any,
  requestedMemberId?: string | null,
): Promise<string | null> {
  return await resolveMemberIdCore(req.headers.get("Authorization"), requestedMemberId ?? null, {
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null,
    anonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? null,
    getUserId: async (token: string) => {
      try {
        const { data, error } = await admin.auth.getUser(token);
        if (error || !data?.user) return null;
        return data.user.id as string;
      } catch {
        return null;
      }
    },
    getMemberIdByUserId: async (userId: string) => {
      try {
        const { data } = await admin
          .from("platform_members")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        return (data?.id as string) ?? null;
      } catch {
        return null;
      }
    },
  });
}
