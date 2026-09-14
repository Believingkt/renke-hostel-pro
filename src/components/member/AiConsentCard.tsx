import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAiConsent } from "@/hooks/use-ai-consent";

/** 「我的帳號」：AI 管家資料傳送同意開關（可隨時撤回） */
const AiConsentCard = () => {
  const { status, granted, grant, revoke } = useAiConsent();

  if (status === "loading") return null;

  const onToggle = async (checked: boolean) => {
    if (checked) {
      await grant();
      toast.success("已同意 AI 管家傳送對話內容");
    } else {
      await revoke();
      toast.success("已撤回同意，下次使用 AI 管家會再次詢問");
    }
  };

  return (
    <Card className="p-4 flex items-start justify-between gap-4">
      <div className="flex gap-3">
        <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium">AI 管家小安</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            同意後，您在各 AI 介面輸入的訊息與對話紀錄，會依使用介面傳送給 Anthropic PBC（Claude AI）或 Google LLC（Gemini）；語音功能由 OpenAI, L.L.C. 處理。
            關閉後將停用 AI 管家，再次使用時需重新同意。
          </p>
        </div>
      </div>
      <Switch checked={granted} onCheckedChange={onToggle} aria-label="AI 管家資料傳送同意" />
    </Card>
  );
};

export default AiConsentCard;
