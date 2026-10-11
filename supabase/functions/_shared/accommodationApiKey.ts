// 民宿 API Key 驗證（與 accommodation-api 同一套金鑰／範圍規則），供其他短網址函式共用。
// - x-api-key / Authorization: Bearer / ?key= 三擇一
// - 範圍 = 主館 ∪ accommodation_api_key_scopes；多館金鑰一律唯讀；範圍查詢失敗 fail-closed
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface ApiKeyAuth {
  supabase: SupabaseClient;
  accommodationId: string;
  keyHash: string;
  isReadOnly: boolean;
  allowedAccommodationIds: Set<string>;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function extractApiKey(req: Request, allowQuery = false): string | null {
  const fromHeader =
    req.headers.get("x-api-key") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (fromHeader) return fromHeader;
  if (allowQuery) {
    const q = new URL(req.url).searchParams.get("key");
    if (q) return q.trim();
  }
  return null;
}

export async function authenticateApiKey(
  req: Request,
  opts: { allowQueryKey?: boolean } = {},
): Promise<{ auth: ApiKeyAuth } | { error: { status: number; message: string } }> {
  const apiKey = extractApiKey(req, opts.allowQueryKey === true);
  if (!apiKey) return { error: { status: 401, message: "Missing API key" } };

  const keyHash = await sha256Hex(apiKey);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await supabase.rpc("verify_accommodation_api_key", { p_key_hash: keyHash });
  if (error || !data || data.length === 0) {
    return { error: { status: 401, message: "Invalid or inactive API key" } };
  }
  const accommodationId = data[0].accommodation_id as string;
  const keyId = (data[0] as Record<string, unknown>).key_id as string | undefined;

  let isReadOnly = true;
  const allowedAccommodationIds = new Set<string>([accommodationId]);
  if (keyId) {
    const [{ data: keyRow, error: keyErr }, { data: scopeRows, error: scopeErr }] = await Promise.all([
      supabase.from("accommodation_api_keys").select("is_read_only").eq("id", keyId).maybeSingle(),
      supabase.from("accommodation_api_key_scopes").select("accommodation_id").eq("api_key_id", keyId),
    ]);
    if (!keyErr && keyRow) isReadOnly = keyRow.is_read_only === true;
    if (scopeErr) return { error: { status: 500, message: "Unable to resolve API key scope" } };
    for (const row of scopeRows || []) allowedAccommodationIds.add(row.accommodation_id as string);
    if (allowedAccommodationIds.size > 1) isReadOnly = true;
  }

  return { auth: { supabase, accommodationId, keyHash, isReadOnly, allowedAccommodationIds } };
}
