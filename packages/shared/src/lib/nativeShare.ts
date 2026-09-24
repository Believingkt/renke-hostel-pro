/**
 * 原生／網頁分享統一入口。
 *
 * - Capacitor 原生環境：呼叫 @capacitor/share 開啟系統分享表單（iOS Share Sheet）
 * - 網頁：優先 navigator.share，不支援時退回「複製連結」
 *
 * 分享連結一律使用 bookingAbsoluteUrl()（booking.lakeze.com 民宿頁），
 * 不得包含訂單編號等個資。
 */
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { bookingAbsoluteUrl } from "@lakeze/shared/lib/frontendUrl";

export interface ShareStayInput {
  accommodationId?: string | null;
  /** 自訂網域（可選），未提供時使用 booking.lakeze.com */
  customDomain?: string | null;
  accommodationName?: string | null;
  /** 一段簡介 */
  description?: string | null;
  /** 直接指定連結（預設由 accommodationId 產生） */
  url?: string | null;
}

export type ShareStayResult =
  | { status: "shared" }
  | { status: "copied" }
  | { status: "cancelled" }
  | { status: "error"; message?: string };

function buildText(input: ShareStayInput): { title: string; text: string; url: string } {
  const title = input.accommodationName?.trim() || "民宿介紹";
  const raw = (input.description || "").replace(/\s+/g, " ").trim();
  const text = raw ? (raw.length > 120 ? `${raw.slice(0, 120)}…` : raw) : title;
  const url =
    input.url ||
    bookingAbsoluteUrl({
      accommodationId: input.accommodationId,
      customDomain: input.customDomain,
    });
  return { title, text, url };
}

async function copyLink(url: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export async function shareStay(input: ShareStayInput): Promise<ShareStayResult> {
  const { title, text, url } = buildText(input);

  // 1) Capacitor 原生分享表單
  if (Capacitor.isNativePlatform()) {
    try {
      const can = await Share.canShare();
      if (can.value) {
        await Share.share({ title, text, url, dialogTitle: title });
        return { status: "shared" };
      }
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (/cancel/i.test(msg) || /abort/i.test(msg)) return { status: "cancelled" };
      // 其他錯誤 → 走複製 fallback
    }
  }

  // 2) Web Share API
  if (typeof navigator !== "undefined" && typeof (navigator as any).share === "function") {
    try {
      await (navigator as any).share({ title, text, url });
      return { status: "shared" };
    } catch (err: any) {
      if (err?.name === "AbortError") return { status: "cancelled" };
      // 其他失敗（iframe 未授權 web-share 等）→ 複製 fallback
    }
  }

  // 3) 複製連結
  return (await copyLink(url)) ? { status: "copied" } : { status: "error" };
}
