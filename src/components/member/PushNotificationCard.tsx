import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { isNativeApp } from "@/lib/appMode";
import {
  getPushPermissionState,
  initPushNotifications,
  isPushEnabled,
  type PushPermissionState,
} from "@/lib/pushNotifications";

/** 「我的帳號」推播通知說明入口：僅於 iOS/Android App 內顯示，網頁版不渲染 */
const PushNotificationCard = () => {
  const [state, setState] = useState<PushPermissionState>("unsupported");
  const [enabled, setEnabled] = useState(false);

  const refresh = async () => {
    const perm = await getPushPermissionState();
    setState(perm);
    setEnabled(await isPushEnabled());
  };

  useEffect(() => {
    if (!isNativeApp()) return;
    void refresh();
  }, []);

  if (!isNativeApp() || state === "unsupported") return null;

  const onToggle = async (checked: boolean) => {
    toast.message(checked ? "正在開啟通知…" : "通知開關", { duration: 4000 });
    if (!checked) {
      toast.message("請至裝置系統設定「通知 → 人客多」關閉通知");
      await refresh();
      return;
    }
    // force：即使先前被拒絕過，也再嘗試一次系統詢問（iOS 已永久拒絕時會直接回 denied）
    const next = await initPushNotifications({ force: true });
    console.log("[push] enable() result:", next);
    setState(next);
    const on = await isPushEnabled();
    setEnabled(on);
    if (on) toast.success("已開啟通知");
    else toast.error(`通知未開啟：${next}`, { duration: 10000 });
  };

  return (
    <Card className="p-4 border-orange-100">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-[hsl(24,100%,50%)]/10 flex items-center justify-center shrink-0">
          <Bell className="h-5 w-5 text-[hsl(24,100%,50%)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">開啟訂單通知</div>
            <Switch checked={enabled} onCheckedChange={onToggle} />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {enabled
              ? "已開啟，訂房成功、付款確認、退款與入住提醒都會通知您。"
              : state === "denied"
                ? "目前為關閉狀態。請至 iPhone「設定 → 通知 → 人客多」開啟「允許通知」，即可收到訂房成功、付款確認與入住提醒。"
                : "開啟後可即時收到訂房成功、付款確認、退款與明日入住提醒。"}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default PushNotificationCard;
