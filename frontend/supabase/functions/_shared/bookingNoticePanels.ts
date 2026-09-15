/**
 * 訂房須知面板組裝（唯一來源）
 *
 * 由 booking_settings ＋ accommodation_info.check_in_notice ＋ custom_sections 組成面板，
 * 再依 visibleKeys（group_buy_campaigns.booking_notice_keys）過濾與排序。
 *
 * 此為 Deno 複本，來源：src/lib/bookingNoticePanels.ts（請同步修改）。
 */

export interface BookingNoticeCustomSection {
  id: string;
  section_title: string;
  section_subtitle: string | null;
  section_content: string | null;
  display_order: number;
  is_enabled: boolean;
}

export interface BookingNoticePanel {
  key: string;
  title: string;
  subtitle?: string;
  /** 純文字列（入住/退房時間、付款方式） */
  textRows?: { label?: string; value: string }[];
  /** 富文字 HTML */
  html?: string;
}

const nonEmpty = (v: unknown) => typeof v === "string" && v.trim() !== "";

export function buildBookingNoticePanels(
  bookingSettings: any,
  checkInNotice?: string | null,
  customSections: BookingNoticeCustomSection[] = [],
): BookingNoticePanel[] {
  const bs = bookingSettings ?? null;
  const panels: BookingNoticePanel[] = [];

  const hasCheckIn = nonEmpty(bs?.check_in_time);
  const hasCheckOut = nonEmpty(bs?.check_out_time);
  if (hasCheckIn || hasCheckOut) {
    panels.push({
      key: "checkIn",
      title: bs?.check_in_section_title || "入住時間",
      subtitle: bs?.check_in_section_subtitle || undefined,
      textRows: [
        ...(hasCheckIn ? [{ label: "入住", value: `${bs.check_in_time} 之後` }] : []),
        ...(hasCheckOut ? [{ label: "退房", value: `${bs.check_out_time} 之前` }] : []),
      ],
    });
  }
  if (Array.isArray(bs?.payment_methods) && bs.payment_methods.length > 0) {
    panels.push({
      key: "payment",
      title: bs?.payment_section_title || "付款方式",
      subtitle: bs?.payment_section_subtitle || undefined,
      textRows: bs.payment_methods.map((m: string) => ({ value: m })),
    });
  }
  if (nonEmpty(bs?.cancellation_policy)) {
    panels.push({
      key: "cancellation",
      title: bs?.cancellation_section_title || "取消政策",
      subtitle: bs?.cancellation_section_subtitle || undefined,
      html: bs.cancellation_policy,
    });
  }
  if (nonEmpty(checkInNotice)) {
    panels.push({
      key: "important",
      title: bs?.important_section_title || "重要事項",
      subtitle: bs?.important_section_subtitle || undefined,
      html: String(checkInNotice),
    });
  }
  if (nonEmpty(bs?.pet_policy)) {
    panels.push({
      key: "pet",
      title: bs?.pet_section_title || "寵物入住守則",
      subtitle: bs?.pet_section_subtitle || undefined,
      html: bs.pet_policy,
    });
  }
  if (nonEmpty(bs?.other_notes)) {
    panels.push({
      key: "other",
      title: bs?.other_section_title || "其他注意事項",
      subtitle: bs?.other_section_subtitle || undefined,
      html: bs.other_notes,
    });
  }
  (customSections ?? [])
    .filter((s) => s.is_enabled && nonEmpty(s.section_content))
    .sort((a, b) => a.display_order - b.display_order)
    .forEach((s) => {
      panels.push({
        key: `custom-${s.id}`,
        title: s.section_title,
        subtitle: s.section_subtitle || undefined,
        html: s.section_content || "",
      });
    });

  return panels;
}

/** 依 visibleKeys 順序過濾；undefined／null＝全部顯示，失效 key 自動略過 */
export function applyVisibleKeys(
  panels: BookingNoticePanel[],
  visibleKeys?: string[] | null,
): BookingNoticePanel[] {
  if (!visibleKeys) return panels;
  return visibleKeys
    .map((k) => panels.find((p) => p.key === k))
    .filter(Boolean) as BookingNoticePanel[];
}
