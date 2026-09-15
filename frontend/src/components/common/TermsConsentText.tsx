import { cn } from "@/lib/utils";

interface Props {
  /** groupbuy 版本額外提及團購訂房須知與取消政策 */
  variant?: "default" | "group_buy";
  className?: string;
}

const linkClass = "mx-1 text-primary underline underline-offset-4";

/** 純展示元件：送出訂單即視為同意的條款文案（一般訂房與團購共用） */
export function TermsConsentText({ variant = "default", className }: Props) {
  const base = cn("text-xs leading-relaxed text-muted-foreground sm:text-sm", className);

  const terms = (
    <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className={linkClass}>
      條款及細則
    </a>
  );
  const privacy = (
    <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className={linkClass}>
      隱私條款
    </a>
  );

  if (variant === "group_buy") {
    return (
      <p className={base}>
        送出訂單即表示您已閱讀並同意本次團購活動之訂房須知、取消政策，以及 Lakeze 人客多之{terms}與{privacy}。
      </p>
    );
  }

  return (
    <p className={base}>
      送出訂單即表示我已閱讀並接受 Lakeze 人客多 之{terms}與{privacy}。
    </p>
  );
}

export default TermsConsentText;
