import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { isNativeApp } from "@/lib/appMode";
import {
  getPushPermissionState,
  initPushNotifications,
  type PushPermissionState,
} from "@/lib/pushNotifications";

/** 「我的帳號」推播通知說明入口：僅於 iOS/Android App 內顯示，網頁版不渲染 */
const PushNotificationCard = () => {
  const [state, setState] = useState<PushPermissionState>("unsupported");

  useEffect(() => {
    if (!isNativeApp()) return;
    getPushPermissionState().then(setState);
  }, []);

  if (!isNativeApp() || state === "unsupported") return null;

  const enable = async () => {
    // force：即使先前被拒絕過，也再嘗試一次系統詢問（iOS 已永久拒絕時會直接回 denied）
    const next = await initPushNotifications({ force: true });
    setState(next);
  };

  return (
    <Card className="p-4 border-orange-100">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-[hsl(24,100%,50%)]/10 flex items-center justify-center shrink-0">
          <Bell className="h-5 w-5 text-[hsl(24,100%,50%)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">開啟訂單通知</div>
          {state === "granted" ? (
            <div className="text-xs text-muted-foreground mt-0.5">
              已開啟，訂房成功、付款確認、退款與入住提醒都會通知您。
            </div>
          ) : state === "denied" ? (
            <>
              <div className="text-xs text-muted-foreground mt-0.5 mb-2">
                目前為關閉狀態。請至 iPhone「設定 → 通知 → 人客多」開啟「允許通知」，
                即可收到訂房成功、付款確認與入住提醒。
              </div>
              <Button size="sm" variant="outline" onClick={enable}>再試一次</Button>
            </>
          ) : (
            <>
              <div className="text-xs text-muted-foreground mt-0.5 mb-2">
                開啟後可即時收到訂房成功、付款確認、退款與明日入住提醒。
              </div>
              <Button size="sm" onClick={enable}>開啟訂單通知</Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
};


export default PushNotificationCard;
