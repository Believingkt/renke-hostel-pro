import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface Props {
  bookingSettings?: any;
  /** 展開後顯示的完整訂房須知（既有 BookingInfoSection） */
  children: ReactNode;
}

/** 團購頁「訂房須知」：第一層只顯示摘要，點擊後才展開完整內容 */
export function GroupBuyBookingInfoCompact({ bookingSettings, children }: Props) {
  const [open, setOpen] = useState(false);

  const rows: { label: string; value: string }[] = [];
  if (bookingSettings?.check_in_time) rows.push({ label: "入住", value: `${bookingSettings.check_in_time} 後` });
  if (bookingSettings?.check_out_time) rows.push({ label: "退房", value: `${bookingSettings.check_out_time} 前` });
  if (Array.isArray(bookingSettings?.payment_methods) && bookingSettings.payment_methods.length > 0) {
    rows.push({ label: "付款", value: bookingSettings.payment_methods.join("、") });
  }
  if (bookingSettings?.cancellation_policy) rows.push({ label: "取消", value: "依取消政策" });

  return (
    <section className="py-8 sm:py-10">
      <div className="mx-auto w-full max-w-[1040px] px-5 sm:px-6">
        <h2 className="text-[1.375rem] font-bold tracking-tight sm:text-[1.625rem]">訂房須知</h2>
        {rows.length > 0 && (
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {rows.map((r) => (
              <div key={r.label} className="flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm">
                <dt className="shrink-0 font-medium text-foreground">{r.label}</dt>
                <dd className="min-w-0 text-muted-foreground">{r.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4"
        >
          {open ? "收合訂房須知" : "查看完整訂房須知"}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && <div className="mt-2 [&_section]:py-4">{children}</div>}
      </div>
    </section>
  );
}

export default GroupBuyBookingInfoCompact;
