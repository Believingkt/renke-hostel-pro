import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  enableBiometricLogin,
  hasAskedBiometricPrompt,
  isBiometricAvailable,
  isBiometricEnabled,
  markBiometricPromptAsked,
} from "@/lib/biometricAuth";

/** 登入後的一次性提示：詢問是否啟用 Face ID 快速登入（僅 iOS App） */
const BiometricEnrollPrompt = () => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (hasAskedBiometricPrompt() || isBiometricEnabled()) return;
      if (!(await isBiometricAvailable())) return;
      setOpen(true);
    })();
  }, []);

  const decline = () => {
    markBiometricPromptAsked();
    setOpen(false);
  };

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await enableBiometricLogin();
      toast.success("已啟用 Face ID 快速登入");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "啟用失敗，可稍後於「我的帳號」開啟");
      markBiometricPromptAsked();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && decline()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>啟用 Face ID 快速登入？</AlertDialogTitle>
          <AlertDialogDescription>
            下次開啟 App 時可直接以 Face ID / Touch ID 登入，不需重新輸入帳號密碼。
            登入資訊只會保存在本機 Keychain。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={decline}>
            暫不啟用
          </AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void accept(); }}>
            啟用
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default BiometricEnrollPrompt;
