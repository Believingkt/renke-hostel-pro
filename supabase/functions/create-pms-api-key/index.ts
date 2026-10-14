// 建立 PMS（accommodation-api）金鑰：僅 super_admin；伺服器端產生 32 bytes 亂數，明文只回傳一次，DB 只存 SHA-256。
// deno-lint-ignore-file no-explicit-any
import { resolveCaller } from "../_shared/authz.ts";
import {
  encodePmsKey,
  PMS_KEY_BYTES,
  pmsKeyDisplayPrefix,
  validateCreatePmsKeyInput,
} from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const resolved = await resolveCaller(req);
    if (!resolved.ok) return json({ error: resolved.error }, resolved.status);
    const ctx = resolved.ctx;
    // 僅限真實登入的 super_admin 使用者（不接受 service-role 或其他角色）
    if (!ctx.userId || !ctx.globalRoles.includes("super_admin")) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => null);
    const parsed = validateCreatePmsKeyInput(body);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const { accommodationId, name, extraAccommodationIds, isReadOnly } = parsed.value;

    const admin = ctx.admin;
    const allIds = [accommodationId, ...extraAccommodationIds];
    const { data: accRows, error: accErr } = await admin
      .from("accommodation_info")
      .select("id")
      .in("id", allIds);
    if (accErr) return json({ error: "accommodation_lookup_failed" }, 500);
    if ((accRows || []).length !== allIds.length) return json({ error: "accommodation_not_found" }, 400);

    const bytes = new Uint8Array(PMS_KEY_BYTES);
    crypto.getRandomValues(bytes);
    const plain = encodePmsKey(bytes);
    const keyHash = await sha256Hex(plain);

    const { data: inserted, error: insErr } = await admin
      .from("accommodation_api_keys")
      .insert({
        accommodation_id: accommodationId,
        name,
        key_hash: keyHash,
        key_prefix: pmsKeyDisplayPrefix(plain),
        is_read_only: isReadOnly,
        created_by: ctx.userId,
      })
      .select("id, accommodation_id, name, key_prefix, is_active, is_read_only, created_at")
      .single();
    if (insErr || !inserted) {
      console.error("create-pms-api-key insert failed", insErr?.code);
      return json({ error: "create_failed" }, 500);
    }

    if (extraAccommodationIds.length > 0) {
      const { error: scopeErr } = await admin
        .from("accommodation_api_key_scopes")
        .insert(extraAccommodationIds.map((id) => ({ api_key_id: inserted.id, accommodation_id: id })));
      if (scopeErr) {
        // 範圍寫入失敗即撤銷金鑰，不留下範圍不完整的金鑰
        await admin.from("accommodation_api_keys").delete().eq("id", inserted.id);
        console.error("create-pms-api-key scope insert failed", scopeErr.code);
        return json({ error: "scope_create_failed" }, 500);
      }
    }

    return json({ key: plain, ...inserted, extra_accommodation_ids: extraAccommodationIds });
  } catch (e) {
    console.error("create-pms-api-key error", (e as Error).name);
    return json({ error: "internal_error" }, 500);
  }
});
