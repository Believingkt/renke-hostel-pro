/**
 * Booking 前台語言切換（繁中｜EN）。
 * 純顯示控制項：只改 locale state，不碰任何 Booking business state / URL / query。
 */
import { useBookingLocale } from "@/contexts/BookingLocaleContext";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  /** 手機版緊湊樣式 */
  compact?: boolean;
}

const BookingLanguageSwitch = ({ className, compact = false }: Props) => {
  const { lang, setLang, t } = useBookingLocale();

  const items: { code: "zh-TW" | "en"; label: string; aria: string }[] = [
    {
      code: "zh-TW",
      label: t("booking.common.language.zh"),
      aria: t("booking.common.language.switchTo.zh"),
    },
    {
      code: "en",
      label: t("booking.common.language.en"),
      aria: t("booking.common.language.switchTo.en"),
    },
  ];

  return (
    <div
      role="group"
      aria-label={t("booking.common.language")}
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-muted/40 p-0.5 shrink-0",
        className,
      )}
    >
      {items.map((it) => {
        const active = lang === it.code;
        return (
          <button
            key={it.code}
            type="button"
            onClick={() => setLang(it.code)}
            aria-label={it.aria}
            aria-pressed={active}
            className={cn(
              "rounded-full font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              compact
                ? "px-2 py-1 text-[12px]"
                : "px-2 py-1 text-[12px] sm:px-2.5 sm:text-[13px]",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
};

export default BookingLanguageSwitch;
