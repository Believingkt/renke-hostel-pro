import { cn } from "@/lib/utils";

/** AI 對話框內固定顯示的一行揭露文字 */
export default function AIDisclosureNote({ className }: { className?: string }) {
  return (
    <p className={cn("text-[11px] leading-snug text-muted-foreground text-center px-3", className)}>
      您的訊息會傳送給 Anthropic（Claude AI）以產生回覆，不會傳送您的會員姓名與 Email。
      <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary underline mx-1">
        隱私權政策
      </a>
    </p>
  );
}
