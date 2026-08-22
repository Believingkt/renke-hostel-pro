import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { MAX_NOTIFICATION_EMAILS, isValidNotificationEmail } from "@/lib/notificationEmails";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

/** 多筆 Email 輸入（每筆獨立欄位，不使用逗號字串） */
export function NotificationEmailListField({ value, onChange, disabled, placeholder }: Props) {
  const rows = value.length > 0 ? value : [""];

  const setAt = (i: number, v: string) => {
    const next = [...rows];
    next[i] = v;
    onChange(next);
  };
  const removeAt = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {rows.map((email, i) => {
        const invalid = email.trim().length > 0 && !isValidNotificationEmail(email);
        const dup =
          email.trim().length > 0 &&
          rows.findIndex((r) => r.trim().toLowerCase() === email.trim().toLowerCase()) !== i;
        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center gap-2">
              <Input
                type="email"
                inputMode="email"
                value={email}
                disabled={disabled}
                onChange={(e) => setAt(i, e.target.value)}
                placeholder={placeholder ?? "booking@example.com"}
                className={invalid ? "border-destructive" : undefined}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                onClick={() => removeAt(i)}
                aria-label="刪除信箱"
                className="shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {invalid && <p className="text-xs text-destructive">Email 格式不正確</p>}
            {!invalid && dup && <p className="text-xs text-muted-foreground">重複的信箱，儲存時會自動去除</p>}
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || rows.length >= MAX_NOTIFICATION_EMAILS}
        onClick={() => onChange([...rows, ""])}
      >
        <Plus className="h-4 w-4 mr-1" />
        新增信箱
      </Button>
      <p className="text-xs text-muted-foreground">最多 {MAX_NOTIFICATION_EMAILS} 筆，儲存時會自動去除空白與重複。</p>
    </div>
  );
}
