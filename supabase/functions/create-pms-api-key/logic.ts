// 純函式（無 Deno / DB 依賴）：PMS API 金鑰建立的輸入驗證與金鑰格式，供 Edge Function 與 Vitest 共用。
export const PMS_KEY_PREFIX = "acc_pms_";
export const PMS_KEY_BYTES = 32;
export const READ_WRITE_CONFIRM_TOKEN = "READ_WRITE";
export const MAX_EXTRA_SCOPES = 50;
export const MAX_NAME_LENGTH = 100;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreatePmsKeyInput {
  accommodationId: string;
  name: string;
  extraAccommodationIds: string[];
  isReadOnly: boolean;
}

export type ValidationResult =
  | { ok: true; value: CreatePmsKeyInput }
  | { ok: false; error: string };

export function validateCreatePmsKeyInput(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_body" };
  const b = body as Record<string, unknown>;

  const accommodationId = typeof b.accommodation_id === "string" ? b.accommodation_id : "";
  if (!UUID_REGEX.test(accommodationId)) return { ok: false, error: "accommodation_id_invalid" };

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length > MAX_NAME_LENGTH) return { ok: false, error: "name_invalid" };

  const rawExtras = b.extra_accommodation_ids ?? [];
  if (!Array.isArray(rawExtras)) return { ok: false, error: "extra_accommodation_ids_invalid" };
  if (rawExtras.some((id) => typeof id !== "string" || !UUID_REGEX.test(id))) {
    return { ok: false, error: "extra_accommodation_ids_invalid" };
  }
  const extraAccommodationIds = Array.from(new Set(rawExtras as string[])).filter((id) => id !== accommodationId);
  if (extraAccommodationIds.length > MAX_EXTRA_SCOPES) return { ok: false, error: "too_many_scopes" };

  const wantsReadWrite = b.read_write === true;
  if (wantsReadWrite) {
    if (b.confirm_read_write !== READ_WRITE_CONFIRM_TOKEN) return { ok: false, error: "read_write_not_confirmed" };
    if (extraAccommodationIds.length > 0) return { ok: false, error: "multi_scope_must_be_read_only" };
  }

  return { ok: true, value: { accommodationId, name, extraAccommodationIds, isReadOnly: !wantsReadWrite } };
}

export function encodePmsKey(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64url = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${PMS_KEY_PREFIX}${b64url}`;
}

export function pmsKeyDisplayPrefix(key: string): string {
  return `${key.slice(0, PMS_KEY_PREFIX.length + 6)}...`;
}
