import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Archive, ArchiveRestore, Loader2, MoreHorizontal, Trash2 } from "lucide-react";

export interface DangerZoneCampaign {
  id: string;
  title: string;
  status: string;
  is_archived?: boolean | null;
}

interface Precheck {
  exists: boolean;
  title?: string;
  packages?: number;
  orders?: number;
  active_orders?: number;
  paid_orders?: number;
  refunded_orders?: number;
  can_hard_delete?: boolean;
  blockers?: string[];
}

/**
 * 團購活動「更多操作」：封存 / 解除封存 / 永久刪除。
 * 所有判斷與刪除都在 Edge Function + DB function（同一 transaction）完成，
 * 前端不會直接 delete 任何資料。
 */
export function GroupBuyCampaignDangerZone({
  campaign,
  onChanged,
}: {
  campaign: DangerZoneCampaign;
  onChanged: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [precheck, setPrecheck] = useState<Precheck | null>(null);

  const call = async (action: "precheck" | "archive" | "unarchive" | "delete") => {
    const { data, error } = await supabase.functions.invoke("group-buy-campaign-admin", {
      body: { action, campaign_id: campaign.id },
    });
    if (error) {
      // Edge Function 非 2xx 時，錯誤訊息藏在 response body
      let message = error.message;
      try {
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx) {
          const body = await ctx.json();
          if (body?.error) message = body.error;
        }
      } catch { /* ignore */ }
      throw new Error(message);
    }
    if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
    return data as { precheck?: Precheck; deleted?: boolean; archived?: boolean };
  };

  const openDeleteDialog = async () => {
    setOpen(true);
    setLoading(true);
    setPrecheck(null);
    try {
      const res = await call("precheck");
      setPrecheck(res.precheck ?? null);
    } catch (e) {
      toast({ title: "無法取得活動資訊", description: e instanceof Error ? e.message : "", variant: "destructive" });
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const runArchive = async (archive: boolean) => {
    setBusy(true);
    try {
      await call(archive ? "archive" : "unarchive");
      toast({ title: archive ? "已封存活動" : "已解除封存" });
      await onChanged();
    } catch (e) {
      toast({ title: "操作失敗", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    setBusy(true);
    try {
      await call("delete");
      toast({ title: "已永久刪除團購活動" });
      setOpen(false);
      await onChanged();
    } catch (e) {
      toast({ title: "無法刪除", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const archived = Boolean(campaign.is_archived);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" aria-label="更多操作">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>更多操作</DropdownMenuLabel>
          {archived ? (
            <DropdownMenuItem disabled={busy} onSelect={() => void runArchive(false)}>
              <ArchiveRestore className="mr-2 h-4 w-4" /> 解除封存
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={busy} onSelect={() => void runArchive(true)}>
              <Archive className="mr-2 h-4 w-4" /> 封存活動
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-destructive">危險操作</DropdownMenuLabel>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            disabled={busy}
            onSelect={() => void openDeleteDialog()}
          >
            <Trash2 className="mr-2 h-4 w-4" /> 刪除活動
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>永久刪除團購活動</DialogTitle>
            <DialogDescription>此操作由後端驗證，不會刪除任何歷史訂單。</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> 檢查活動關聯資料中…
            </div>
          ) : precheck ? (
            <div className="space-y-3 text-sm">
              <div>
                活動名稱：<span className="font-medium">{precheck.title ?? campaign.title}</span>
              </div>
              <div className="text-muted-foreground">
                目前：方案 {precheck.packages ?? 0} 個、訂單 {precheck.orders ?? 0} 筆
                {(precheck.active_orders ?? 0) > 0 ? `（其中未結束 ${precheck.active_orders} 筆）` : ""}
              </div>

              {precheck.can_hard_delete ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive">
                  刪除後將移除活動設定、方案與其他活動層資料，此操作無法復原。
                </div>
              ) : (
                <div className="rounded-md border bg-muted/40 p-3">
                  {precheck.blockers?.[0] ?? "此活動不可永久刪除，請改用封存。"}
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              取消
            </Button>
            {!loading && precheck && !precheck.can_hard_delete && !archived && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  await runArchive(true);
                  setOpen(false);
                }}
              >
                <Archive className="mr-1 h-4 w-4" /> 改為封存
              </Button>
            )}
            {!loading && precheck?.can_hard_delete && (
              <Button variant="destructive" disabled={busy} onClick={() => void runDelete()}>
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
                永久刪除
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default GroupBuyCampaignDangerZone;
