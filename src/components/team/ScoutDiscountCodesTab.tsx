import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";

type CommissionType = "scout_self" | "partner";

interface ScoutCode {
  id: string;
  discount_code: string;
  scout_id: string | null;
  closer_id: string | null;
  commission_type: CommissionType;
  scout_rate: number | null;
  closer_rate: number | null;
  is_active: boolean | null;
  accommodation_id: string | null;
}

interface AccommodationOpt {
  id: string;
  name: string;
}

interface MemberOpt {
  id: string;          // team_member_profiles.id
  user_id: string;
  display_name: string;
}

interface PmsCode {
  code: string;
  is_active: boolean | null;
}

const NONE = "none";

const fmtPct = (n: number | null | undefined) =>
  n == null ? "-" : `${(Number(n) * 100).toFixed(1)}%`;

export default function ScoutDiscountCodesTab() {
  const [rows, setRows] = useState<ScoutCode[]>([]);
  const [scouts, setScouts] = useState<MemberOpt[]>([]);
  const [accommodations, setAccommodations] = useState<AccommodationOpt[]>([]);
  const [pmsCodes, setPmsCodes] = useState<Map<string, PmsCode>>(new Map());
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScoutCode | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // form
  const [fCode, setFCode] = useState("");
  const [fAcc, setFAcc] = useState<string>(NONE);
  const [fScout, setFScout] = useState<string>(NONE);
  const [fType, setFType] = useState<CommissionType>("scout_self");
  const [fScoutRate, setFScoutRate] = useState<string>("5");
  const [fCloserRate, setFCloserRate] = useState<string>("0");

  const scoutMap = useMemo(
    () => new Map(scouts.map((s) => [s.id, s.display_name])),
    [scouts]
  );
  const accMap = useMemo(
    () => new Map(accommodations.map((a) => [a.id, a.name])),
    [accommodations]
  );

  const loadAll = async () => {
    setLoading(true);
    const [{ data: codeRows }, { data: scoutRoles }, { data: pms }, { data: accs }] =
      await Promise.all([
        supabase
          .from("scout_discount_codes")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["scout", "scout_manager"] as any),
        supabase.from("discount_codes").select("code, is_active"),
        supabase
          .from("accommodation_info")
          .select("id, name")
          .eq("is_active", true)
          .order("name"),
      ]);

    setAccommodations((accs ?? []) as AccommodationOpt[]);

    const scoutIds = Array.from(new Set((scoutRoles ?? []).map((r: any) => r.user_id)));

    let memberRows: MemberOpt[] = [];
    if (scoutIds.length) {
      const { data: tm } = await supabase
        .from("team_member_profiles")
        .select("id, user_id, display_name")
        .in("user_id", scoutIds);
      memberRows = (tm ?? []) as MemberOpt[];
    }

    setScouts(memberRows.filter((m) => scoutIds.includes(m.user_id)));

    const pmsMap = new Map<string, PmsCode>();
    (pms ?? []).forEach((p: any) => {
      if (p.code) pmsMap.set(String(p.code).trim().toUpperCase(), p);
    });
    setPmsCodes(pmsMap);

    setRows((codeRows ?? []) as ScoutCode[]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setFCode("");
    setFAcc(NONE);
    setFScout(NONE);
    setFType("scout_self");
    setFScoutRate("5");
    setFCloserRate("0");
    setDialogOpen(true);
  };

  const openEdit = (row: ScoutCode) => {
    setEditing(row);
    setFCode(row.discount_code ?? "");
    setFAcc(row.accommodation_id ?? NONE);
    setFScout(row.scout_id ?? NONE);
    setFType((row.commission_type as CommissionType) ?? "scout_self");
    setFScoutRate(String(((row.scout_rate ?? 0) * 100).toFixed(2)).replace(/\.?0+$/, "") || "0");
    setFCloserRate(String(((row.closer_rate ?? 0) * 100).toFixed(2)).replace(/\.?0+$/, "") || "0");
    setDialogOpen(true);
  };

  const onTypeChange = (v: CommissionType) => {
    setFType(v);
    if (v === "scout_self") {
      setFScoutRate("5");
      setFCloserRate("0");
    } else {
      setFScoutRate("2");
      setFCloserRate("3");
    }
  };

  const save = async () => {
    if (!fCode.trim()) {
      toast.error("請輸入折扣碼");
      return;
    }
    if (fScout === NONE) {
      toast.error("請選擇星探");
      return;
    }
    setSaving(true);
    const payload = {
      discount_code: fCode.trim(),
      accommodation_id: fAcc === NONE ? null : fAcc,
      scout_id: fScout,
      closer_id: null,
      commission_type: fType,
      scout_rate: Number(fScoutRate || 0) / 100,
      closer_rate: fType === "partner" ? Number(fCloserRate || 0) / 100 : 0,
      is_active: true,
    };
    const q = editing
      ? supabase.from("scout_discount_codes").update(payload).eq("id", editing.id)
      : supabase.from("scout_discount_codes").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "已更新" : "已新增");
    setDialogOpen(false);
    loadAll();
  };

  const doDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase
      .from("scout_discount_codes")
      .delete()
      .eq("id", deleteId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("已刪除");
    setDeleteId(null);
    loadAll();
  };

  const renderPmsBadge = (code: string) => {
    const hit = pmsCodes.get(code.trim().toUpperCase());
    if (!hit) {
      return <span className="text-destructive">✗ 未建立</span>;
    }
    if (hit.is_active) {
      return <span className="text-green-600">✓ 已建立</span>;
    }
    return <span className="text-orange-500">已停用</span>;
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        此表的折扣代碼，不需填寫資料在「KOL星探邀約表」，會獨立設定 &amp; 計算分潤獎金
      </p>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              共 {rows.length} 筆
            </div>
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4 mr-1" /> 新增折扣碼
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table className="fixed-table">
              <TableHeader>
                <TableRow>
                  <TableHead>折扣碼</TableHead>
                  <TableHead>民宿</TableHead>
                  <TableHead>星探</TableHead>
                  <TableHead>成交模式</TableHead>
                  <TableHead className="text-right">星探分潤%</TableHead>
                  <TableHead>PMS匹配</TableHead>
                  <TableHead className="w-28">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      載入中…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      尚無資料
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono whitespace-nowrap">{r.discount_code}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.accommodation_id ? accMap.get(r.accommodation_id) ?? "—" : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.scout_id ? scoutMap.get(r.scout_id) ?? "—" : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.commission_type === "partner" ? "夥伴成交" : "星探自成"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPct(r.scout_rate)}</TableCell>
                      <TableCell className="whitespace-nowrap">{renderPmsBadge(r.discount_code)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteId(r.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "編輯折扣碼" : "新增折扣碼"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>折扣碼</Label>
              <Input
                value={fCode}
                onChange={(e) => setFCode(e.target.value)}
                placeholder="輸入折扣碼"
              />
            </div>

            <div className="space-y-1">
              <Label>民宿</Label>
              <Select value={fAcc} onValueChange={setFAcc}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇民宿" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>未指定</SelectItem>
                  {accommodations.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>


            <div className="space-y-1">
              <Label>星探</Label>
              <Select value={fScout} onValueChange={setFScout}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇星探" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>未指定</SelectItem>
                  {scouts.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>成交模式</Label>
              <Select value={fType} onValueChange={(v) => onTypeChange(v as CommissionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scout_self">星探自成</SelectItem>
                  <SelectItem value="partner">夥伴成交</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>星探分潤 %</Label>
              <Input
                type="number"
                step="0.1"
                value={fScoutRate}
                onChange={(e) => setFScoutRate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "儲存中…" : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除？</AlertDialogTitle>
            <AlertDialogDescription>
              刪除後將無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
