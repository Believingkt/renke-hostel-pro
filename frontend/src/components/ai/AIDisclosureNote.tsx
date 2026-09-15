import { cn } from "@/lib/utils";

type Provider = "anthropic" | "google";

interface Props {
  provider: Provider;
  showVoiceDisclosure?: boolean;
  className?: string;
}

/** AI 對話框內固定顯示的實際服務商揭露文字。 */
export default function AIDisclosureNote({ provider, showVoiceDisclosure = false, className }: Props) {
  const message = provider === "google"
    ? "您的訊息會經 Lovable AI Gateway 傳送給 Google LLC（Gemini）以產生回覆。"
    : "您的訊息會傳送給 Anthropic PBC（Claude AI）以產生回覆。";

  return (
    <p className={cn("text-[11px] leading-snug text-muted-foreground text-center px-3", className)}>
      {message}不會主動傳送您的會員姓名與 Email。
      {showVoiceDisclosure && " 使用語音時，錄音內容或待朗讀文字會傳送給 OpenAI, L.L.C. 處理。"}
      <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary underline mx-1">
        隱私權政策
      </a>
    </p>
  );
}
