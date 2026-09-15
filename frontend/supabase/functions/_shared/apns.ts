// APNs HTTP/2 直連（不使用 Firebase）。
// 需要的 secrets：APNS_KEY_ID、APNS_TEAM_ID、APNS_P8（.p8 內容，含 BEGIN/END 行）
// 選用：APNS_TOPIC（預設 com.lakeze.booking）、APNS_ENV（production | sandbox）

const DEFAULT_TOPIC = "com.lakeze.booking";

export interface ApnsPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badge?: number;
  sound?: string;
  threadId?: string;
}

export interface ApnsSendResult {
  token: string;
  ok: boolean;
  status: number;
  reason?: string;
  /** true 代表 token 已失效，應從資料庫移除 */
  invalidToken: boolean;
}

function b64url(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") bytes = new TextEncoder().encode(input);
  else if (input instanceof Uint8Array) bytes = input;
  else bytes = new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const raw = atob(body);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

let cachedJwt: { token: string; issuedAt: number } | null = null;

/** APNs provider JWT（ES256，Apple 要求 20~60 分鐘輪替一次，這裡 40 分鐘） */
export async function getApnsJwt(): Promise<string> {
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const p8 = Deno.env.get("APNS_P8");
  if (!keyId || !teamId || !p8) {
    throw new Error("APNS_NOT_CONFIGURED");
  }

  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.issuedAt < 40 * 60) return cachedJwt.token;

  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: teamId, iat: now }));
  const signingInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(p8),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  const token = `${signingInput}.${b64url(sig)}`;
  cachedJwt = { token, issuedAt: now };
  return token;
}

export function apnsHost(): string {
  return Deno.env.get("APNS_ENV") === "sandbox"
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";
}

/** 送一則推播到單一 device token */
export async function sendApnsToToken(
  deviceToken: string,
  payload: ApnsPayload,
  jwt: string,
): Promise<ApnsSendResult> {
  const topic = Deno.env.get("APNS_TOPIC") || DEFAULT_TOPIC;
  const body = {
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: payload.sound ?? "default",
      ...(payload.badge !== undefined ? { badge: payload.badge } : {}),
      ...(payload.threadId ? { "thread-id": payload.threadId } : {}),
    },
    ...(payload.data ?? {}),
  };

  try {
    const resp = await fetch(`${apnsHost()}/3/device/${deviceToken}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (resp.status === 200) {
      await resp.body?.cancel();
      return { token: deviceToken, ok: true, status: 200, invalidToken: false };
    }

    const text = await resp.text();
    let reason = text;
    try {
      reason = JSON.parse(text)?.reason ?? text;
    } catch { /* keep raw */ }

    const invalidToken =
      resp.status === 410 ||
      (resp.status === 400 && ["BadDeviceToken", "DeviceTokenNotForTopic"].includes(reason));

    return { token: deviceToken, ok: false, status: resp.status, reason, invalidToken };
  } catch (e) {
    return {
      token: deviceToken,
      ok: false,
      status: 0,
      reason: e instanceof Error ? e.message : "network_error",
      invalidToken: false,
    };
  }
}
