// Shared helper for leaked-password checks using Have I Been Pwned (Pwned Passwords) k-anonymity API.
// NOTE: We never transmit the password itself; only the first 5 chars of its SHA-1 hash.

const DEFAULT_TIMEOUT_MS = 3500;
const DEFAULT_RETRIES = 1;

function envInt(name: string, fallback: number) {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sha1HexUpper(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function fetchRange(prefix: string): Promise<string> {
  const timeoutMs = envInt("HIBP_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
  const retries = envInt("HIBP_RETRIES", DEFAULT_RETRIES);

  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        signal: controller.signal,
        headers: {
          // Required by HIBP ToS
          "User-Agent": "LovableCloudPasswordCheck/1.0",
          // Recommended to improve privacy
          "Add-Padding": "true",
        },
      });

      if (!res.ok) throw new Error(`Password leak check failed (${res.status})`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      // Small backoff before retry
      if (attempt < retries) await delay(200 * (attempt + 1));
    } finally {
      clearTimeout(t);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("Password leak check failed");
}

/**
 * Returns true if the password is present in known leaked-password datasets.
 * Throws on network/timeout errors so callers can decide fail-open vs fail-closed.
 */
export async function isLeakedPassword(password: string): Promise<boolean> {
  const hash = await sha1HexUpper(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const body = await fetchRange(prefix);
  for (const line of body.split("\n")) {
    const [hashSuffix] = line.trim().split(":");
    if (hashSuffix && hashSuffix.toUpperCase() === suffix) return true;
  }
  return false;
}
