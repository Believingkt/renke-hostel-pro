import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { disableBiometricLogin } from "@/lib/biometricAuth";

const CONFIRM_WORD = "刪除";

const DeleteAccountSection = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);

  const handleDelete = async () => {
    if (confirmText.trim() !== CONFIRM_WORD || busy) return;
    setBusy(true);
    setBlockedMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account", { body: {} });
      const res = (data ?? {}) as { success?: boolean; error?: string; code?: string };

      if (res.success !== true) {
        // 有即將入住的訂單或其他錯誤
        const message =
          res.error ||
          (error
            ? "刪除失敗，請稍後再試或聯絡客服 service@lakeze.com"
            : "刪除失敗，請聯絡客服 service@lakeze.com");
        setBlockedMsg(message);
        setBusy(false);
        return;
      }

      await disableBiometricLogin();
      await supabase.auth.signOut();
      try {
        localStorage.clear();
      } catch {
        /* ignore */
      }
      toast({ title: "帳號已刪除", description: "感謝您曾經使用人客多，期待再相見。" });
      navigate("/", { replace: true });
    } catch (e) {
      setBlockedMsg((e as Error).message || "刪除失敗，請聯絡客服 service@lakeze.com");
      setBusy(false);
    }
  };

  return (
    <>
      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={() => {
            setConfirmText("");
            setBlockedMsg(null);
            setOpen(true);
          }}
          className="text-xs text-destructive/80 hover:text-destructive underline underline-offset-4"
        >
          刪除帳號
        </button>
      </div>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">確認刪除帳號</DialogTitle>
            <DialogDescription className="text-left space-y-2 pt-2">
              <span className="block">
                刪除後，您的<strong>會員資料、紅利點數與優惠券將永久移除且無法復原</strong>。
              </span>
              <span className="block">
                已完成的訂單紀錄依法令須保存，但會進行<strong>去識別化</strong>，不再與您的身分連結。
              </span>
              <span className="block">若您仍有即將入住的訂單，請先取消訂單或聯絡客服。</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">
              請輸入「<span className="text-destructive font-medium">{CONFIRM_WORD}</span>」以確認：
            </label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              className="text-base"
              disabled={busy}
            />
            {blockedMsg && (
              <p className="text-sm text-destructive whitespace-pre-line">{blockedMsg}</p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={busy || confirmText.trim() !== CONFIRM_WORD}
            >
              {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              永久刪除帳號
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DeleteAccountSection;
