import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Mic } from "lucide-react";

interface Props {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export default function VoiceConsentDialog({ open, onAccept, onDecline }: Props) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-left">
            <Mic className="h-5 w-5 text-primary" />
            使用語音輸入前，請先確認
          </AlertDialogTitle>
        </AlertDialogHeader>
        <div className="space-y-3 text-sm leading-relaxed text-foreground">
          <p>使用語音輸入時，App 會錄下您說話的內容，並傳送給 OpenAI, L.L.C. 轉換成文字。</p>
          <p>轉換後的文字只用於輸入您的 AI 管家提問；您可以先檢查及修改文字，再決定是否送出。</p>
          <p className="text-muted-foreground">您可以選擇不同意，並繼續使用文字輸入及其他功能。</p>
          <a href="/privacy" target="_blank" rel="noreferrer" className="inline-block text-primary underline">
            查看隱私權政策
          </a>
        </div>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onDecline}>不同意</Button>
          <Button onClick={onAccept}>同意並開始錄音</Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}