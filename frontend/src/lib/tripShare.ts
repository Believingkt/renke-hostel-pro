/**
 * 行程分享連結工具。
 * share_slug 由既有 trips.share_slug 提供；若為空則呼叫 SECURITY DEFINER RPC
 * ensure_trip_share_slug 產生唯一 slug（公開唯讀 RLS 已允許以 slug 讀取）。
 */
import { supabase } from "@/integrations/supabase/client";

/** 取得（必要時產生）行程分享 slug */
export async function ensureShareSlug(tripId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("ensure_trip_share_slug", {
    p_trip_id: tripId,
  } as never);
  if (error) return null;
  return (data as string | null) || null;
}

/** 公開唯讀分享頁網址（絕對路徑，可直接分享／產 QR） */
export function shareUrl(slugOrId: string, lang?: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const q = lang ? `?lang=${lang}` : "";
  return `${base}/trips/${slugOrId}/share${q}`;
}

/** 複製到剪貼簿（含 execCommand fallback，避免舊版 in-app browser 失敗） */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}
