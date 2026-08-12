import { useState } from "react";
import { Stethoscope } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "@/lib/appMode";

/**
 * 暫時性推播診斷區塊：把每一步的實際回傳值顯示在畫面上（不只 console）。
 * 僅在原生 App 內顯示，網頁版不渲染。
 */
const PushDiagnosticsCard = () => {
  const [lines, setLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  if (!isNativeApp()) return null;

  const push = (s: string) => setLines((prev) => [...prev, s]);

  const safe = (v: unknown) => {
    try {
      return typeof v === "string" ? v : JSON.stringify(v);
    } catch {
      return String(v);
    }
  };

  const run = async () => {
    setLines([]);
    setRunning(true);
    try {
      const cap = (window as any).Capacitor;

      // 1
      let isNative: unknown = "no Capacitor object";
      try {
        isNative = cap?.isNativePlatform?.();
      } catch (e) {
        isNative = `error: ${safe(e)}`;
      }
      push(`1. isNativePlatform() → ${safe(isNative)}`);
      push(`   platform → ${safe(cap?.getPlatform?.())}`);

      // 2
      let available: unknown;
      try {
        available = cap?.isPluginAvailable?.("PushNotifications");
      } catch (e) {
        available = `error: ${safe(e)}`;
      }
      push(`2. isPluginAvailable('PushNotifications') → ${safe(available)}`);

      let PushNotifications: any = null;
      try {
        const mod = await import("@capacitor/push-notifications");
        PushNotifications = mod.PushNotifications;
        push(`   import plugin → ok`);
      } catch (e) {
        push(`   import plugin → 失敗: ${safe(e)}`);
        return;
      }

      // 3
      let checkRes: any = null;
      try {
        checkRes = await PushNotifications.checkPermissions();
        push(`3. checkPermissions() → ${safe(checkRes)} (receive="${checkRes?.receive}")`);
      } catch (e) {
        push(`3. checkPermissions() 例外 → ${safe(e)}`);
      }

      // 4
      let reqRes: any = null;
      try {
        reqRes = await PushNotifications.requestPermissions();
        push(`4. requestPermissions() → ${safe(reqRes)} (receive="${reqRes?.receive}")`);
      } catch (e) {
        push(`4. requestPermissions() 例外 → ${safe(e)}`);
      }

      // 5
      const result = await new Promise<{ kind: string; detail: string }>((resolve) => {
        let done = false;
        const finish = (kind: string, detail: string) => {
          if (done) return;
          done = true;
          resolve({ kind, detail });
        };
        let h1: any, h2: any;
        PushNotifications.addListener("registration", (t: any) => {
          finish("registration", `token 前 8 碼 = ${String(t?.value ?? "").slice(0, 8)} (len=${String(t?.value ?? "").length})`);
        }).then((h: any) => (h1 = h));
        PushNotifications.addListener("registrationError", (err: any) => {
          finish("registrationError", safe((err as any)?.error ?? err));
        }).then((h: any) => (h2 = h));

        PushNotifications.register()
          .then(() => push(`5. register() → 已呼叫，等待事件…`))
          .catch((e: any) => finish("registerThrow", safe(e)));

        setTimeout(() => {
          finish("timeout", "10 秒內未收到 registration / registrationError");
          try { h1?.remove?.(); h2?.remove?.(); } catch { /* ignore */ }
        }, 10000);
      });
      push(`5. 結果：${result.kind} → ${result.detail}`);

      // 6
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          push(`6. device_tokens upsert → 略過（無登入會員）`);
        } else {
          const tokenMatch = result.detail.match(/= ([A-Za-z0-9]+) /);
          if (result.kind !== "registration") {
            push(`6. device_tokens upsert → 略過（未取得 token）`);
          } else {
            push(`6. 取得 token 前綴 ${tokenMatch?.[1] ?? "?"}，實際 upsert 由 pushNotifications.ts 執行`);
            const { error } = await supabase
              .from("device_tokens")
              .select("token")
              .eq("user_id", user.id)
              .limit(1);
            push(`   device_tokens 讀取測試 → ${error ? `錯誤: ${error.message}` : "ok"}`);
          }
        }
      } catch (e) {
        push(`6. device_tokens 檢查例外 → ${safe(e)}`);
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="p-4 border-dashed">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Stethoscope className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">推播診斷（暫時性）</div>
          <div className="text-xs text-muted-foreground mt-0.5 mb-2">
            逐步顯示權限、註冊與 token 儲存的實際回傳值。
          </div>
          <Button size="sm" variant="outline" onClick={run} disabled={running}>
            {running ? "診斷中…" : "執行推播診斷"}
          </Button>
          {lines.length > 0 && (
            <pre className="mt-3 whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-[12px] leading-relaxed">
              {lines.join("\n")}
            </pre>
          )}
        </div>
      </div>
    </Card>
  );
};

export default PushDiagnosticsCard;
