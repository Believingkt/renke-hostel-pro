import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { Button } from "@lakeze/shared/components/ui/button";
import { Mic } from "lucide-react";

interface Props {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

/** 語音輸入同意框；與 AI 同意框同一層級規則，永遠蓋在聊天面板（z-[80]）之上。 */
export default function VoiceConsentDialog({ open, onAccept, onDecline }: Props) {
  return (
    <AlertDialogPrimitive.Root open={open}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[1000] bg-black/80 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <AlertDialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-[1001] flex w-[calc(100%-2rem)] max-w-md translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-lg border bg-background shadow-lg"
          style={{ maxHeight: "80vh" }}
        >
          <div className="shrink-0 border-b border-border px-5 py-4">
            <AlertDialogPrimitive.Title className="flex items-center gap-2 text-left text-lg font-semibold">
              <Mic className="h-5 w-5 text-primary" />
              使用語音輸入前，請先確認
            </AlertDialogPrimitive.Title>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4 text-sm leading-relaxed text-foreground">
            <p>使用語音輸入時，App 會錄下您說話的內容，並傳送給 OpenAI, L.L.C. 轉換成文字。</p>
            <p>轉換後的文字只用於輸入您的 AI 管家提問；您可以先檢查及修改文字，再決定是否送出。</p>
            <p className="text-muted-foreground">您可以選擇不同意，並繼續使用文字輸入及其他功能。</p>
            <a href="/privacy" target="_blank" rel="noreferrer" className="inline-block text-primary underline">
              查看隱私權政策
            </a>
          </div>

          <div className="shrink-0 border-t border-border bg-background px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onDecline}>不同意</Button>
            <Button onClick={onAccept}>同意並開始錄音</Button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
