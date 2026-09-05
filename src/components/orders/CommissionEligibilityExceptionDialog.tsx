import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * 獎金資格例外（既有 /admin/orders/:id 專用，僅 Superadmin 開啟）
 *
 * 嚴格範圍：只讀取／送出 force_commission_* 四個欄位。
 * - 不載入一般補充行銷資訊（那些只在 /team 修改）
 * - 不載入、不顯示、不送出任何人工分潤金額或確認欄位
 * - 不引用 OrderMetaDrawer 的 state 或 payload builder
 * - 實際分潤金額仍由系統 canonical 計算產生
 */

export const FORCE_FIELD_ALLOWLIST = [
  "order_id",
  "force_commission_eligible",
  "force_commission_reason",
  "force_commission_by",
  "force_commission_at",
] as const;

const SELECT_FORCE_FIELDS =
  "force_commission_eligible, force_commission_reason, force_commission_by, force_commission_at";

interface CommissionEligibilityExceptionDialogProps {
  orderId: string | null;
  open: boolean;
  onClose: () => void;
}

export function CommissionEligibilityExceptionDialog({
  orderId,
  open,
  onClose,
}: CommissionEligibilityExceptionDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rowExists, setRowExists] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [reason, setReason] = useState("");
  const [actorId, setActorId] = useState<string | null>(null);
  const [actorName, setActorName] = useState<string | null>(null);
  const [actorAt, setActorAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("order_meta")
        .select(SELECT_FORCE_FIELDS)
        .eq("order_id", orderId)
        .maybeSingle();
      if (error) throw error;
      const row = (data ?? null) as Record<string, any> | null;
      setRowExists(!!row);
      setEligible(row?.force_commission_eligible === true);
      setReason(row?.force_commission_reason ?? "");
      setActorId(row?.force_commission_by ?? null);
      setActorAt(row?.force_commission_at ?? null);

      if (row?.force_commission_by) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("name")
          .eq("id", row.force_commission_by)
          .maybeSingle();
        setActorName((prof as any)?.name ?? null);
      } else {
        setActorName(null);
      }
    } catch (e: any) {
      toast.error(`讀取失敗：${e?.message ?? "未知錯誤"}`);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (open && orderId) void load();
  }, [open, orderId, load]);

  const handleSave = async () => {
    if (!orderId || saving) return;
    const trimmed = reason.trim();
    if (eligible && !trimmed) {
      toast.error("請填寫例外原因");
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id ?? null;
      const nowIso = new Date().toISOString();

      const expected = {
        force_commission_eligible: eligible,
        force_commission_reason: eligible ? trimmed : null,
        force_commission_by: eligible ? uid : null,
        force_commission_at: eligible ? nowIso : null,
      };

      if (rowExists) {
        const { data: rows, error } = await supabase
          .from("order_meta")
          .update(expected as any)
          .eq("order_id", orderId)
          .select("order_id");
        if (error) throw error;
        if (!rows || rows.length === 0) {
          throw new Error("沒有資料被更新，可能是權限不足或資料已變更，請重新整理後再試。");
        }
      } else {
        const { data: rows, error } = await supabase
          .from("order_meta")
          .insert({ order_id: orderId, ...expected } as any)
          .select("order_id");
        if (error) throw error;
        if (!rows || rows.length === 0) {
          throw new Error("沒有資料被建立，可能是權限不足，請重新整理後再試。");
        }
      }

      // Persist verification：以 DB 實際保存值為準，不允許假成功
      const { data: persisted, error: verifyErr } = await supabase
        .from("order_meta")
        .select(SELECT_FORCE_FIELDS)
        .eq("order_id", orderId)
        .maybeSingle();
      if (verifyErr) throw verifyErr;
      const p = (persisted ?? null) as Record<string, any> | null;
      const ok =
        !!p &&
        p.force_commission_eligible === expected.force_commission_eligible &&
        (p.force_commission_reason ?? null) === expected.force_commission_reason &&
        (p.force_commission_by ?? null) === expected.force_commission_by &&
        (expected.force_commission_at === null
          ? (p.force_commission_at ?? null) === null
          : !!p.force_commission_at);
      if (!ok) {
        throw new Error("儲存後驗證失敗，資料未依預期保存，請重新整理後再試。");
      }

      toast.success("已更新獎金資格例外");
      onClose();
    } catch (e: any) {
      toast.error(`儲存失敗：${e?.message ?? "未知錯誤"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>獎金資格例外</DialogTitle>
          <DialogDescription>
            僅調整此訂單是否納入成交組獎金計算，實際分潤金額仍由系統自動計算。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <Checkbox
              id="force-commission-exception"
              checked={eligible}
              disabled={loading || saving}
              onCheckedChange={(v) => setEligible(v === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="force-commission-exception" className="text-sm">
                計入成交組獎金（例外）
              </Label>
              <p className="text-xs text-muted-foreground">
                適用於原本因訂單來源而不列入成交組獎金的特殊訂單（如 KOL 自費）。啟用後僅解除獎金資格排除。
              </p>
            </div>
          </div>

          {eligible && (
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例外原因（必填，將寫入變更紀錄）"
              rows={3}
              disabled={loading || saving}
            />
          )}

          <div className="text-xs text-muted-foreground space-y-1 rounded-md bg-muted/40 p-2">
            <div>
              最後操作者：{actorName ?? (actorId ? actorId : "—")}
            </div>
            <div>
              最後操作時間：
              {actorAt ? new Date(actorAt).toLocaleString("zh-TW") : "—"}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving ? "儲存中..." : "儲存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CommissionEligibilityExceptionDialog;
