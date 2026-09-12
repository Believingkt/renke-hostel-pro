import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

interface Props {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * AI 管家首次使用同意對話框
 * 使用者按下「同意並繼續」之前，不得送出任何訊息到 AI 服務商。
 */
export default function AIConsentDialog({ open, onAccept, onDecline }: Props) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-left">
            <ShieldCheck className="h-5 w-5 text-primary" />
            使用 AI 管家前，請先確認
          </AlertDialogTitle>
        </AlertDialogHeader>

        <div className="space-y-4 text-sm leading-relaxed text-foreground">
          <p>人客多的 AI 功能由第三方 AI 服務產生回覆。使用不同介面時，資料會傳送給下列對應服務商處理：</p>

          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
            <p className="font-semibold">會送給誰</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Anthropic PBC（Claude AI）：AI 管家小安與入口網「AI 找房間」的文字對話。</li>
              <li>Google LLC（Gemini，經 Lovable AI Gateway 轉送）：民宿頁懸浮小安的文字對話。</li>
              <li>OpenAI, L.L.C.：語音輸入轉文字與 AI 回覆語音朗讀；僅在您主動使用語音功能時處理。</li>
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
            <p className="font-semibold">會送出哪些資料</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>您在對話框輸入的訊息文字</li>
              <li>本次對話的前後訊息紀錄（用於理解上下文）</li>
              <li>您在對話中選擇的查詢條件：入住／退房日期、人數、地區、民宿或房型名稱</li>
              <li>若您在對話中要求直接訂房，您自行輸入的訂房聯絡資料（姓名、手機、Email）會一併送出以完成訂單</li>
              <li>使用語音輸入時，您錄下的語音內容；語音功能會在首次使用時另外徵求同意</li>
              <li>使用語音朗讀時，待朗讀的 AI 回覆文字</li>
            </ul>
            <p className="pt-1 text-muted-foreground">
              我們不會主動把您的會員姓名、Email、電話、歷史訂單或瀏覽紀錄送給 AI 服務商。
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1">
            <p className="font-semibold">用途</p>
            <p>協助推薦民宿、回答訂房問題，以及在您要求時協助完成訂房。</p>
          </div>

          <p className="text-muted-foreground">
            您可以隨時在「我的帳號」關閉 AI 管家同意；不同意也可以正常使用網站與 App 的其他功能。詳情請見
            <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary underline mx-1">
              隱私權政策
            </a>
            。
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onDecline}>
            不同意
          </Button>
          <Button onClick={onAccept}>同意並繼續</Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
