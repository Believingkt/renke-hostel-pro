/** 旅客合併鍵（CDP）正規化工具：優先 email，其次手機。 */

export function normalizeEmail(email: unknown): string {
  if (typeof email !== "string") return "";
  const e = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : "";
}

/** 手機正規化：只留數字，去除國碼 886，補回開頭 0 */
export function normalizePhone(phone: unknown): string {
  if (typeof phone !== "string") return "";
  let d = phone.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("886")) d = "0" + d.slice(3);
  if (d.length < 8) return "";
  return d;
}

/** 合併鍵：email:<email> 或 phone:<digits> */
export function buildCustomerKey(email: unknown, phone: unknown): string {
  const e = normalizeEmail(email);
  if (e) return `email:${e}`;
  const p = normalizePhone(phone);
  if (p) return `phone:${p}`;
  return "";
}
