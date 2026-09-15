// SHA-256 hash helper for storing API keys / passwords as hashes (never plaintext) in the database.
// Usage:
//   const { plaintext, hash, prefix } = await generateApiKey('kol_');
//   await supabase.from('table').update({ api_key_hash: hash, api_key_prefix: prefix });
//   // show `plaintext` to the user once, never store it.

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(length = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < length; i++) out += chars.charAt(buf[i] % chars.length);
  return out;
}

export async function generateApiKey(prefix = "kol_") {
  const plaintext = `${prefix}${randomToken(32)}`;
  const hash = await sha256Hex(plaintext);
  return { plaintext, hash, prefix: plaintext.slice(0, 8) };
}

export function generatePassword(length = 32): string {
  const arr = new Uint8Array(Math.ceil((length * 3) / 4));
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/[+/=]/g, "")
    .slice(0, length);
}
