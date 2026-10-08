// 依 accommodation_id 載入「館別自有資料」注入 AI context（J）。
// 優先序：館別自編 FAQ(ai_knowledge ai_faq) > 官網 FAQ(faqs) > 設施/訂房須知 > 全平台知識庫。
// 全程防呆：任一查詢失敗只略過該段，不拋出。
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function loadAccommodationContext(
  sb: SupabaseClient,
  accommodationId: string,
): Promise<string> {
  if (!accommodationId) return "";
  const parts: string[] = [];
  try {
    const [faqs, facilities, booking, info] = await Promise.all([
      sb.from("faqs").select("question, answer")
        .eq("accommodation_id", accommodationId).order("display_order").limit(50),
      sb.from("accommodation_facilities").select("facility_name, description")
        .eq("accommodation_id", accommodationId).limit(100),
      sb.from("booking_info_sections").select("section_title, section_subtitle, section_content")
        .eq("accommodation_id", accommodationId).order("display_order").limit(50),
      sb.from("accommodation_info").select("about_section")
        .eq("id", accommodationId).maybeSingle(),
    ]);

    if (faqs.data?.length) {
      parts.push(
        "## 本館常見問答（官網 FAQ，請照實回答）\n" +
        faqs.data.map((f: any) => `Q：${f.question}\nA：${f.answer}`).join("\n"),
      );
    }
    if (facilities.data?.length) {
      parts.push(
        "## 本館設施\n" +
        facilities.data.map((f: any) => `- ${f.facility_name}${f.description ? `：${f.description}` : ""}`).join("\n"),
      );
    }
    if (booking.data?.length) {
      parts.push(
        "## 本館訂房須知\n" +
        booking.data.map((b: any) =>
          `### ${b.section_title}${b.section_subtitle ? `（${b.section_subtitle}）` : ""}\n${b.section_content ?? ""}`,
        ).join("\n"),
      );
    }
    const about = (info.data as any)?.about_section;
    if (about && String(about).trim()) {
      parts.push(`## 關於本館\n${String(about).trim()}`);
    }
  } catch (e) {
    console.warn("[accommodationContext] load failed", e);
  }
  if (!parts.length) return "";
  return "\n\n# 本館專屬資料（最高優先，有寫的一律照實回答；僅在本館與平台資料都查無時才請轉真人客服，不得自行編造）\n" + parts.join("\n\n");
}
