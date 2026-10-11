// 依 accommodation_id 載入「館別自有資料」注入 AI context（J）。
// 優先序：館別自編 FAQ(ai_knowledge ai_faq) > 官網 FAQ(faqs) > 設施/訂房須知 > 全平台知識庫。
// 全程防呆：任一查詢失敗只略過該段，不拋出。
// 效能/正確性：並行查詢、只讀「已上架/啟用中」條目、只取必要欄位、並限制注入總長度。
// 訂房須知與官網 BookingInfoSection 同一來源（booking_settings + accommodation_info.check_in_notice + booking_info_sections），
// 只放官網實際會顯示的欄位、空值不放；超過總長上限時先裁「關於本館」→「設施」→「FAQ」，訂房須知不被截掉。
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_CONTEXT_CHARS = 3500;

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** 官網欄位多為 HTML：去標籤、保留換行，供 LLM 讀 */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

/** 與官網 buildBookingNoticePanels 同順序：入住時間 → 付款方式 → 取消政策 → 重要事項 → 寵物 → 其他 → 自訂區塊 */
export function buildBookingNoticeText(
  bs: Record<string, any> | null | undefined,
  checkInNotice: string | null | undefined,
  customSections: Array<{ section_title: string; section_subtitle?: string | null; section_content?: string | null }>,
): string {
  const sections: string[] = [];
  const title = (key: string, fallback: string) => {
    const t = bs?.[`${key}_section_title`];
    const s = bs?.[`${key}_section_subtitle`];
    return `### ${nonEmpty(t) ? t : fallback}${nonEmpty(s) ? `（${s}）` : ""}`;
  };

  const timeRows: string[] = [];
  if (nonEmpty(bs?.check_in_time)) timeRows.push(`入住：${bs!.check_in_time} 之後`);
  if (nonEmpty(bs?.check_out_time)) timeRows.push(`退房：${bs!.check_out_time} 之前`);
  if (timeRows.length) sections.push(`${title("check_in", "入住時間")}\n${timeRows.join("\n")}`);

  if (Array.isArray(bs?.payment_methods) && bs!.payment_methods.length > 0) {
    sections.push(`${title("payment", "付款方式")}\n${bs!.payment_methods.map((m: string) => `- ${m}`).join("\n")}`);
  }
  if (nonEmpty(bs?.cancellation_policy)) {
    const extra = Number.isFinite(Number(bs?.free_cancel_days)) && Number(bs?.free_cancel_days) > 0
      ? `\n（系統設定：入住前 ${Number(bs!.free_cancel_days)} 天可免費取消）`
      : "";
    sections.push(`${title("cancellation", "取消政策")}\n${htmlToPlain(bs!.cancellation_policy)}${extra}`);
  }
  if (nonEmpty(checkInNotice)) sections.push(`${title("important", "重要事項")}\n${htmlToPlain(checkInNotice)}`);
  if (nonEmpty(bs?.pet_policy)) sections.push(`${title("pet", "寵物入住守則")}\n${htmlToPlain(bs!.pet_policy)}`);
  if (nonEmpty(bs?.other_notes)) sections.push(`${title("other", "其他注意事項")}\n${htmlToPlain(bs!.other_notes)}`);

  for (const s of customSections) {
    if (!nonEmpty(s.section_content)) continue;
    sections.push(
      `### ${s.section_title}${nonEmpty(s.section_subtitle) ? `（${s.section_subtitle}）` : ""}\n${htmlToPlain(s.section_content)}`,
    );
  }
  return sections.length ? "## 本館訂房須知（官網「訂房須知」實際顯示內容，請照實回答）\n" + sections.join("\n") : "";
}

export async function loadAccommodationContext(
  sb: SupabaseClient,
  accommodationId: string,
): Promise<string> {
  if (!accommodationId) return "";
  // 依優先序排列；超長時從陣列尾端（低優先）開始裁，訂房須知（index 1）不裁
  let faqPart = "";
  let noticePart = "";
  let facilitiesPart = "";
  let aboutPart = "";
  try {
    const [faqs, facilities, booking, info, settings] = await Promise.all([
      sb.from("faqs").select("question, answer")
        .eq("accommodation_id", accommodationId).eq("is_published", true)
        .order("display_order").limit(30),
      sb.from("accommodation_facilities").select("facility_name")
        .eq("accommodation_id", accommodationId).eq("is_available", true).limit(60),
      sb.from("booking_info_sections").select("section_title, section_subtitle, section_content")
        .eq("accommodation_id", accommodationId).eq("is_enabled", true)
        .order("display_order").limit(30),
      sb.from("accommodation_info").select("about_section, check_in_notice")
        .eq("id", accommodationId).maybeSingle(),
      sb.from("booking_settings").select(
        "check_in_time, check_out_time, payment_methods, cancellation_policy, free_cancel_days, pet_policy, other_notes, " +
        "check_in_section_title, check_in_section_subtitle, payment_section_title, payment_section_subtitle, " +
        "cancellation_section_title, cancellation_section_subtitle, important_section_title, important_section_subtitle, " +
        "pet_section_title, pet_section_subtitle, other_section_title, other_section_subtitle",
      ).eq("accommodation_id", accommodationId).maybeSingle(),
    ]);

    if (faqs.data?.length) {
      faqPart = "## 本館常見問答（官網 FAQ，請照實回答）\n" +
        faqs.data.map((f: any) => `Q：${f.question}\nA：${f.answer}`).join("\n");
    }
    if (facilities.data?.length) {
      facilitiesPart = "## 本館設施（已提供）\n" + facilities.data.map((f: any) => `- ${f.facility_name}`).join("\n");
    }
    noticePart = buildBookingNoticeText(
      settings.error ? null : (settings.data as any),
      (info.data as any)?.check_in_notice,
      (booking.data as any[]) ?? [],
    );
    const about = (info.data as any)?.about_section;
    if (nonEmpty(about)) aboutPart = `## 關於本館\n${about.trim()}`;
  } catch (e) {
    console.warn("[accommodationContext] load failed", e);
  }

  const ordered = [faqPart, noticePart, facilitiesPart, aboutPart].filter(Boolean);
  if (!ordered.length) return "";
  const join = (arr: string[]) => arr.join("\n\n");
  // 裁切順序：關於本館 → 設施 → FAQ（從尾端截）；訂房須知不裁
  const trimOrder = [aboutPart, facilitiesPart, faqPart];
  let body = join(ordered);
  for (const victim of trimOrder) {
    if (body.length <= MAX_CONTEXT_CHARS || !victim) continue;
    const over = body.length - MAX_CONTEXT_CHARS;
    const idx = ordered.indexOf(victim);
    if (idx < 0) continue;
    if (victim.length - over < 200) {
      ordered.splice(idx, 1);
    } else {
      ordered[idx] = victim.slice(0, victim.length - over - 20) + "\n…（本段已截斷）";
    }
    body = join(ordered);
  }
  if (body.length > MAX_CONTEXT_CHARS) body = body.slice(0, MAX_CONTEXT_CHARS) + "\n…（本館資料已截斷）";
  return "\n\n# 本館專屬資料（最高優先；與平台知識庫衝突時一律以本館資料為準。有寫的照實回答；僅在本館與平台資料都查無時才請轉真人客服，不得自行編造）\n" + body;
}
