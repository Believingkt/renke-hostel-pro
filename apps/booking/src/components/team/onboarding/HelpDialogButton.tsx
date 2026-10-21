import { useState, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@lakeze/shared/components/ui/dialog";

/** 問號圖示：點開彈跳視窗看設定說明與操作教學 */
export function HelpDialogButton({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" aria-label={`${title}說明`}
        onClick={() => setOpen(true)} data-testid={`${testId}-help-btn`}>
        <HelpCircle className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid={`${testId}-help-dialog`}>
          <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription className="sr-only">設定說明與操作步驟</DialogDescription></DialogHeader>
          <div className="space-y-3 text-sm leading-relaxed">{children}</div>
          <DialogFooter><Button onClick={() => setOpen(false)} data-testid={`${testId}-help-close`}>我知道了</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
