import type { ReactNode } from "react";
import { Label } from "@lakeze/shared/components/ui/label";

interface Props {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: ReactNode;
}

/** 精靈欄位：標籤在上、輸入在中、說明或錯誤在下 */
export function WizardField({ label, htmlFor, hint, error, className = "", children }: Props) {
  return (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor={htmlFor} className="text-sm font-medium">{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}
