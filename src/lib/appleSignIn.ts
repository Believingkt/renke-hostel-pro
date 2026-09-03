// Native Sign in with Apple (Apple Guideline 4.8).
//
// iOS app only: uses @capacitor-community/apple-sign-in to obtain an Apple
// identity token + nonce, then exchanges it for a Supabase session with
// signInWithIdToken. No in-app browser / OAuth redirect is involved.
//
// Web keeps its existing providers (Apple button is hidden on web).

import { Capacitor } from "@capacitor/core";
import { SignInWithApple } from "@capacitor-community/apple-sign-in";
import { supabase } from "@/integrations/supabase/client";

/** Apple button only renders inside the native iOS app. */
export function isAppleSignInAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
}

function randomNonce(length = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < length; i++) out += chars.charAt(buf[i] % chars.length);
  return out;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type AppleSignInResult = {
  fullName: string | null;
  email: string | null;
};

/**
 * Runs the native Apple flow and establishes the Supabase session.
 * Also persists the Apple-provided full name on first login only
 * (Apple returns the name exactly once).
 */
export async function signInWithAppleNative(): Promise<AppleSignInResult> {
  const rawNonce = randomNonce();
  const hashedNonce = await sha256Hex(rawNonce);

  const response = await SignInWithApple.authorize({
    clientId: "com.lakeze.booking", // iOS bundle id — native ID-token flow
    redirectURI: "", // unused by the native flow
    scopes: "email name",
    nonce: hashedNonce,
  });

  const token = response?.response?.identityToken;
  if (!token) throw new Error("未取得 Apple 授權憑證，請重試");

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token,
    nonce: rawNonce,
  });
  if (error) throw error;

  const givenName = response.response.givenName?.trim() || "";
  const familyName = response.response.familyName?.trim() || "";
  // 中文姓名習慣：姓在前
  const fullName = [familyName, givenName].filter(Boolean).join("") || null;

  await persistAppleName(fullName);

  return { fullName, email: response.response.email ?? null };
}

/** 首次登入才寫入姓名；已有姓名不覆蓋。 */
async function persistAppleName(fullName: string | null): Promise<void> {
  if (!fullName) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: member } = await supabase
      .from("platform_members")
      .select("id, name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (member && !String(member.name || "").trim()) {
      await supabase.from("platform_members").update({ name: fullName }).eq("id", member.id);
    }

    if (!String(user.user_metadata?.name || "").trim()) {
      await supabase.auth.updateUser({ data: { name: fullName } });
    }
  } catch (e) {
    console.warn("[appleSignIn] persist name failed", e);
  }
}
