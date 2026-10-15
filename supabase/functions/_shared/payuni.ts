// PAYUNi 統一金流共用層（W1）：設定、加解密、請求封裝、Notify 驗章。
// 加解密與 PAYUNi PHP 範例等價：AES-256-GCM（tag 128 bit）→ base64(cipher) + ":::" + base64(tag) → hex。
// 安全：任何 log 都不得包含 EncryptInfo 原文、HashKey、HashIV；錯誤訊息只寫變數名稱，不寫值。

import { fetchViaProxy } from "./staticIpProxy.ts";

export const PAYUNI_BASE_URLS = {
  sandbox: "https://sandbox-api.payuni.com.tw",
  production: "https://api.payuni.com.tw",
} as const;

export type PayuniEnv = keyof typeof PAYUNI_BASE_URLS;

export interface PayuniConfig {
  env: PayuniEnv;
  baseUrl: string;
  agentId: string;
  hashKey: string;
  hashIv: string;
  /** 人客多自己的商店代號（W9 多功能收付才用；缺少時不擋） */
  agentMerId: string | null;
}

export function getPayuniConfig(): PayuniConfig {
  const env = (Deno.env.get("PAYUNI_ENV") || "sandbox").trim();
  if (env !== "sandbox" && env !== "production") {
    throw new Error("PAYUNI_ENV must be 'sandbox' or 'production'");
  }
  const agentId = Deno.env.get("PAYUNI_AGENT_ID");
  const hashKey = Deno.env.get("PAYUNI_HASH_KEY");
  const hashIv = Deno.env.get("PAYUNI_HASH_IV");
  if (!agentId) throw new Error("PAYUNI_AGENT_ID is not configured");
  if (!/^[A-Z]{4}$/.test(agentId)) throw new Error("PAYUNI_AGENT_ID must be 4 uppercase letters");
  if (!hashKey) throw new Error("PAYUNI_HASH_KEY is not configured");
  if (utf8(hashKey).length !== 32) throw new Error("PAYUNI_HASH_KEY must be 32 bytes");
  if (!hashIv) throw new Error("PAYUNI_HASH_IV is not configured");
  if (utf8(hashIv).length !== 16) throw new Error("PAYUNI_HASH_IV must be 16 bytes");
  return {
    env,
    baseUrl: PAYUNI_BASE_URLS[env],
    agentId,
    hashKey,
    hashIv,
    agentMerId: Deno.env.get("PAYUNI_AGENT_MER_ID") || null,
  };
}

// ---------------- 編碼工具 ----------------

const utf8 = (s: string) => new TextEncoder().encode(s);

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) throw new Error("invalid hex");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function aesKey(key: string, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", utf8(key), { name: "AES-GCM" }, false, [usage]);
}

/** 不受字串比對提前結束影響的比較（避免 timing 洩漏） */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------- 加解密 ----------------

export function buildQuery(params: Record<string, string | number>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) sp.append(k, String(v));
  return sp.toString();
}

export async function encrypt(params: Record<string, string | number>, key: string, iv: string): Promise<string> {
  const sealed = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: utf8(iv), tagLength: 128 },
    await aesKey(key, "encrypt"),
    utf8(buildQuery(params)),
  ));
  // Web Crypto 把 16 bytes tag 接在 ciphertext 尾端，需自行切出
  const cipher = sealed.slice(0, sealed.length - 16);
  const tag = sealed.slice(sealed.length - 16);
  return toHex(utf8(`${toB64(cipher)}:::${toB64(tag)}`));
}

export async function decrypt(hexStr: string, key: string, iv: string): Promise<Record<string, string>> {
  const joined = new TextDecoder().decode(fromHex(hexStr.trim()));
  const parts = joined.split(":::");
  if (parts.length !== 2) throw new Error("invalid EncryptInfo format");
  const cipher = fromB64(parts[0]);
  const tag = fromB64(parts[1]);
  if (tag.length !== 16) throw new Error("invalid tag length");
  const sealed = new Uint8Array(cipher.length + 16);
  sealed.set(cipher);
  sealed.set(tag, cipher.length);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: utf8(iv), tagLength: 128 },
    await aesKey(key, "decrypt"),
    sealed,
  );
  return Object.fromEntries(new URLSearchParams(new TextDecoder().decode(plain)));
}

export async function hashInfo(encryptInfo: string, key: string, iv: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8(key + encryptInfo + iv));
  return toHex(new Uint8Array(digest)).toUpperCase();
}

export async function verifyHashInfo(encryptInfo: string, hash: string, key: string, iv: string): Promise<boolean> {
  return safeEqual(await hashInfo(encryptInfo, key, iv), String(hash).trim().toUpperCase());
}

// ---------------- 請求封裝 ----------------

export type PayuniCall = {
  path: string;
  merId?: string;
  version: string;
  payload: Record<string, string | number>;
  kind: "agent" | "merchant";
};

export type PayuniResult = { ok: boolean; status: string; message?: string; data?: Record<string, string>; raw: unknown };

export type PayuniTransport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; requireProxy: boolean; signal: AbortSignal },
) => Promise<Response>;

export const PAYUNI_TIMEOUT_MS = 30_000;

function logResult(path: string, merId: string | undefined, status: string, message?: string) {
  console.log(`[payuni] ${path} mer=${merId ?? "-"} status=${status}${message ? ` message=${message}` : ""}`);
}

export async function buildOuterBody(call: PayuniCall, cfg: PayuniConfig): Promise<URLSearchParams> {
  const encryptInfo = await encrypt(call.payload, cfg.hashKey, cfg.hashIv);
  const body = new URLSearchParams();
  if (call.kind === "agent") {
    body.set("AgentID", cfg.agentId);
  } else {
    if (!call.merId) throw new Error("merId is required for merchant calls");
    body.set("MerID", call.merId);
  }
  body.set("Version", call.version);
  body.set("EncryptInfo", encryptInfo);
  body.set("HashInfo", await hashInfo(encryptInfo, cfg.hashKey, cfg.hashIv));
  if (call.kind === "merchant") body.set("IsPlatForm", "1");
  return body;
}

export async function callPayuni(
  call: PayuniCall,
  opts: { config?: PayuniConfig; transport?: PayuniTransport } = {},
): Promise<PayuniResult> {
  const cfg = opts.config ?? getPayuniConfig();
  const transport: PayuniTransport = opts.transport ?? ((url, init) => fetchViaProxy(url, init));
  const body = await buildOuterBody(call, cfg);

  let res: Response;
  try {
    res = await transport(`${cfg.baseUrl}${call.path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "user-agent": "payuni" },
      body: body.toString(),
      requireProxy: true,
      signal: AbortSignal.timeout(PAYUNI_TIMEOUT_MS),
    });
  } catch (e) {
    const status = e instanceof DOMException && e.name === "TimeoutError" ? "TIMEOUT" : "NETWORK_ERROR";
    logResult(call.path, call.merId, status);
    return { ok: false, status, message: e instanceof Error ? e.message : String(e), raw: null };
  }

  const text = await res.text();
  if (!res.ok) {
    const status = `HTTP_${res.status}`;
    logResult(call.path, call.merId, status);
    return { ok: false, status, raw: text };
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    logResult(call.path, call.merId, "INVALID_JSON");
    return { ok: false, status: "INVALID_JSON", raw: text };
  }

  const outerStatus = String(json.Status ?? "");
  const message = json.Message != null ? String(json.Message) : undefined;
  let data: Record<string, string> | undefined;

  if (typeof json.EncryptInfo === "string" && json.EncryptInfo) {
    if (!(await verifyHashInfo(json.EncryptInfo, String(json.HashInfo ?? ""), cfg.hashKey, cfg.hashIv))) {
      logResult(call.path, call.merId, "HASH_MISMATCH", message);
      return { ok: false, status: "HASH_MISMATCH", message, raw: json };
    }
    try {
      data = await decrypt(json.EncryptInfo, cfg.hashKey, cfg.hashIv);
    } catch {
      logResult(call.path, call.merId, "DECRYPT_FAILED", message);
      return { ok: false, status: "DECRYPT_FAILED", message, raw: json };
    }
  }

  logResult(call.path, call.merId, outerStatus, message);
  return { ok: outerStatus === "SUCCESS", status: outerStatus, message, data, raw: json };
}

// ---------------- Notify ----------------

export type ParseNotifyResult =
  | { ok: true; outer: Record<string, string>; data: Record<string, string> }
  | { ok: false; reason: "BAD_CONTENT_TYPE" | "MISSING_FIELDS" | "HASH_MISMATCH" | "DECRYPT_FAILED"; outer?: Record<string, string> };

export async function parseNotify(req: Request, opts: { config?: PayuniConfig } = {}): Promise<ParseNotifyResult> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/x-www-form-urlencoded") && !ct.includes("multipart/form-data")) {
    return { ok: false, reason: "BAD_CONTENT_TYPE" };
  }
  let outer: Record<string, string>;
  try {
    const form = await req.formData();
    outer = {};
    for (const [k, v] of form.entries()) if (typeof v === "string") outer[k] = v;
  } catch {
    return { ok: false, reason: "BAD_CONTENT_TYPE" };
  }
  if (!(outer.MerID || outer.AgentID) || !outer.Version || !outer.EncryptInfo || !outer.HashInfo) {
    return { ok: false, reason: "MISSING_FIELDS", outer };
  }
  const cfg = opts.config ?? getPayuniConfig();
  if (!(await verifyHashInfo(outer.EncryptInfo, outer.HashInfo, cfg.hashKey, cfg.hashIv))) {
    return { ok: false, reason: "HASH_MISMATCH", outer };
  }
  try {
    return { ok: true, outer, data: await decrypt(outer.EncryptInfo, cfg.hashKey, cfg.hashIv) };
  } catch {
    return { ok: false, reason: "DECRYPT_FAILED", outer };
  }
}
