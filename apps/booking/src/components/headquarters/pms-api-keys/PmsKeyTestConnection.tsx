import { useState } from "react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { summarizePerformance, formatRate, taipeiToday, type PerformanceSummary } from "@lakeze/shared/utils/pmsApiKey";

export const PMS_API_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accommodation-api`;

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; ms: number; summary: PerformanceSummary }
  | { status: "error"; message: string };

export function PmsKeyTestConnection({ apiKey }: { apiKey: string }) {
  const [state, setState] = useState<State>({ status: "idle" });

  const run = async () => {
    setState({ status: "loading" });
    const today = taipeiToday();
    const started = performance.now();
    try {
      const res = await fetch(`${PMS_API_BASE_URL}/performance?from=${today}&to=${today}`, {
        headers: { "x-api-key": apiKey },
      });
      const body = await res.json().catch(() => null);
      const ms = Math.round(performance.now() - started);
      const summary = res.ok ? summarizePerformance(body) : null;
      if (!summary) return setState({ status: "error", message: `HTTP ${res.status}：${body?.error ?? "回應格式不符"}` });
      setState({ status: "ok", ms, summary });
    } catch {
      setState({ status: "error", message: "無法連線（可能是 Edge Function 尚未部署或網路問題）" });
    }
  };

  return (
    <div className="rounded-md border p-3 space-y-2" data-testid="pms-key-test-connection">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">測試連線：GET /performance（今日）</span>
        <Button size="sm" variant="outline" onClick={run} disabled={state.status === "loading"} data-testid="pms-key-test-btn">
          {state.status === "loading" ? "測試中…" : "測試連線"}
        </Button>
      </div>
      {state.status === "ok" && (
        <div className="text-sm space-y-1" data-testid="pms-key-test-result">
          <Badge data-testid="pms-key-test-ok">連線成功 · {state.ms} ms</Badge>
          <div className="grid grid-cols-2 gap-1 text-muted-foreground">
            <span>今日進單：{state.summary.bookedOrders} 筆</span>
            <span>進單淨營收：NT$ {state.summary.netRevenue.toLocaleString()}</span>
            <span>今晚佔用／可售：{state.summary.occupiedRoomNights}／{state.summary.availableRoomNights}</span>
            <span>住房率：{formatRate(state.summary.occupancyRate)}</span>
          </div>
        </div>
      )}
      {state.status === "error" && (
        <p className="text-sm text-destructive" data-testid="pms-key-test-error">{state.message}</p>
      )}
    </div>
  );
}
