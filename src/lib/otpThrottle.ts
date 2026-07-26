// Client-side OTP send throttle to avoid tripping Supabase Auth's per-hour email rate limit (429).
// Tracks last send timestamp per normalized email in localStorage.

const KEY = "otp_send_throttle_v1";
const COOLDOWN_MS = 60 * 1000; // minimum 60s between sends for same email
const HOURLY_MAX = 2; // Supabase default: 2 auth emails per hour
const HOUR_MS = 60 * 60 * 1000;

type Entry = { last: number; recent: number[]; nextAllowedAt?: number };
type Store = Record<string, Entry>;

function readAll(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function writeAll(map: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

export function getOtpCooldown(email: string): number {
  const e = email.trim().toLowerCase();
  if (!e) return 0;
  const rec = readAll()[e];
  if (!rec) return 0;
  const cutoff = Date.now() - HOUR_MS;
  const recent = (rec.recent || []).filter((t) => t > cutoff);
  const sinceLast = Date.now() - (rec.last || 0);
  let waitMs = 0;
  if (sinceLast < COOLDOWN_MS) waitMs = COOLDOWN_MS - sinceLast;
  if (recent.length >= HOURLY_MAX) {
    const earliest = Math.min(...recent);
    const hourlyWait = HOUR_MS - (Date.now() - earliest);
    if (hourlyWait > waitMs) waitMs = hourlyWait;
  }
  return Math.max(0, Math.ceil(waitMs / 1000));
}

export function markOtpSent(email: string) {
  const e = email.trim().toLowerCase();
  if (!e) return;
  const all = readAll();
  const rec = all[e] || { last: 0, recent: [] };
  const cutoff = Date.now() - HOUR_MS;
  rec.recent = [...(rec.recent || []).filter((t) => t > cutoff), Date.now()];
  rec.last = Date.now();
  all[e] = rec;
  writeAll(all);
}

/**
 * 以後端回傳的 next_allowed_at（ISO 時間戳）為準記錄冷卻結束時間。
 * 存 localStorage，因此頁面重新整理後仍能顯示正確的剩餘秒數。
 */
export function setOtpNextAllowedAt(email: string, nextAllowedAt?: string | null) {
  const e = email.trim().toLowerCase();
  if (!e) return;
  const ts = nextAllowedAt ? new Date(nextAllowedAt).getTime() : NaN;
  if (!Number.isFinite(ts)) return;
  const all = readAll();
  const rec = all[e] || { last: 0, recent: [] };
  rec.nextAllowedAt = ts;
  all[e] = rec;
  writeAll(all);
}

/** 剩餘冷卻秒數（以後端時間戳為準）。 */
export function getOtpRemaining(email: string): number {
  const e = email.trim().toLowerCase();
  if (!e) return 0;
  const rec = readAll()[e];
  if (!rec?.nextAllowedAt) return 0;
  return Math.max(0, Math.ceil((rec.nextAllowedAt - Date.now()) / 1000));
}

