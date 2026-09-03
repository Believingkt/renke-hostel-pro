import { useCallback, useEffect, useState } from "react";
import { Activity, Eraser, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { isNativeApp } from "@/lib/appMode";
import {
  getBadgeUnreadCounts,
  getLastBadgeSyncDiagnostic,
  subscribeBadgeSyncDiagnostic,
  type BadgeSyncDiagnostic,
} from "@/lib/appBadge";

type ResultState = {
  supported: string;
  permission: string;
  pushUnread: number | null;
  total: number | null;
  operation: string;
};

const initialState: ResultState = {
  supported: "讀取中…",
  permission: "讀取中…",
  pushUnread: null,
  total: null,
  operation: "尚未操作",
};

function stringify(value: unknown): string {
  if (value instanceof Error) return value.stack || value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const BadgeDiagnosticsCard = () => {
  const [state, setState] = useState<ResultState>(initialState);
  const [lastSync, setLastSync] = useState<BadgeSyncDiagnostic | null>(() => getLastBadgeSyncDiagnostic());
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { Badge } = await import("@capawesome/capacitor-badge");
      const [supported, permission, counts] = await Promise.all([
        Badge.isSupported(),
        Badge.checkPermissions(),
        getBadgeUnreadCounts(),
      ]);
      setState((current) => ({
        ...current,
        supported: stringify(supported),
        permission: stringify(permission),
        pushUnread: counts.pushUnread,
        total: counts.total,
      }));
    } catch (error) {
      setState((current) => ({ ...current, operation: `初始化錯誤：${stringify(error)}` }));
    }
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    void refresh();
    return subscribeBadgeSyncDiagnostic(setLastSync);
  }, [refresh]);

  if (!isNativeApp()) return null;

  const run = async (label: string, action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setState((current) => ({ ...current, operation: `${label}執行中…` }));
    try {
      const result = await action();
      setState((current) => ({
        ...current,
        operation: `${label}成功${result === undefined ? "" : `：${stringify(result)}`}`,
      }));
    } catch (error) {
      setState((current) => ({ ...current, operation: `${label}錯誤：${stringify(error)}` }));
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const requestPermission = () => run("請求權限", async () => {
    const { Badge } = await import("@capawesome/capacitor-badge");
    return Badge.requestPermissions();
  });

  const setTestBadge = () => run("設定角標 = 5", async () => {
    const { Badge } = await import("@capawesome/capacitor-badge");
    await Badge.set({ count: 5 });
  });

  const clearTestBadge = () => run("清除角標", async () => {
    const { Badge } = await import("@capawesome/capacitor-badge");
    await Badge.clear();
  });

  return (
    <Card className="p-4 border-dashed border-border bg-muted/30">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-5 w-5 text-primary" />
        <div className="text-sm font-semibold">角標診斷（臨時）</div>
      </div>

      <dl className="grid gap-2 text-sm">
        <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2">
          <dt className="text-muted-foreground">isSupported</dt>
          <dd className="font-mono break-all">{state.supported}</dd>
        </div>
        <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2">
          <dt className="text-muted-foreground">權限</dt>
          <dd className="font-mono break-all">{state.permission}</dd>
        </div>
        <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2">
          <dt className="text-muted-foreground">未讀數</dt>
          <dd className="font-mono">total = {state.total ?? "—"}，pushUnread = {state.pushUnread ?? "—"}</dd>
        </div>
      </dl>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={requestPermission}>
          <ShieldCheck />請求權限
        </Button>
        <Button type="button" size="sm" disabled={busy} onClick={setTestBadge}>
          <Activity />設定角標 = 5
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={clearTestBadge}>
          <Eraser />清除角標
        </Button>
      </div>

      <div className="mt-4 space-y-3 text-xs">
        <div>
          <div className="text-muted-foreground mb-1">最近操作結果</div>
          <div className="rounded-md border bg-background p-2 font-mono whitespace-pre-wrap break-all">{state.operation}</div>
        </div>
        <div>
          <div className="text-muted-foreground mb-1">最近一次自動同步 Badge.set</div>
          <div className="rounded-md border bg-background p-2 font-mono whitespace-pre-wrap break-all">
            {lastSync
              ? `${new Date(lastSync.timestamp).toLocaleString()} | count=${lastSync.count} | ${lastSync.success ? "成功" : "錯誤"} | ${lastSync.message}`
              : "尚無同步紀錄"}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default BadgeDiagnosticsCard;