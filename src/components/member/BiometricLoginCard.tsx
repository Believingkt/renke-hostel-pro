import { useEffect, useState } from "react";
import { ScanFace } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  disableBiometricLogin,
  enableBiometricLogin,
  isBiometricAvailable,
  isBiometricEnabled,
} from "@/lib/biometricAuth";

/** 「我的帳號」Face ID 快速登入開關：僅 iOS App 內顯示 */
const BiometricLoginCard = () => {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const ok = await isBiometricAvailable();
      setAvailable(ok);
      setEnabled(isBiometricEnabled());
    })();
  }, []);

  if (!available) return null;

  const onToggle = async (checked: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (checked) {
        await enableBiometricLogin();
        setEnabled(true);
        toast.success("已啟用 Face ID 快速登入");
      } else {
        await disableBiometricLogin();
        setEnabled(false);
        toast.success("已關閉 Face ID 快速登入");
      }
    } catch (e) {
      setEnabled(isBiometricEnabled());
      toast.error(e instanceof Error ? e.message : "設定失敗，請再試一次");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 border-orange-100">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-[hsl(24,100%,50%)]/10 flex items-center justify-center shrink-0">
          <ScanFace className="h-5 w-5 text-[hsl(24,100%,50%)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">Face ID / Touch ID 快速登入</p>
            <Switch checked={enabled} onCheckedChange={onToggle} disabled={busy} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            登入資訊會安全儲存在本機 Keychain，下次開啟 App 可直接以生物辨識登入。
          </p>
        </div>
      </div>
    </Card>
  );
};

export default BiometricLoginCard;
