import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Search, Plus, Pencil, Trash2, Ticket, Send } from "lucide-react";
import { format } from "date-fns";
import { EmptyState } from "@/components/EmptyState";
import { CouponDistributeDialog } from "./CouponDistributeDialog";

interface Coupon {
  id: string;
  code: string;
  coupon_type: string;
  coupon_value: number;
  scope: string;
  accommodation_id: string | null;
  min_order_amount: number;
  usage_limit: number;
  per_member_limit: number;
  used_count: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  accommodation_name?: string;
}

interface AccommodationOption {
  id: string;
  name: string;
}

export interface CouponManagementRef {
  openCreateDialog: () => void;
}

export const CouponManagement = forwardRef<CouponManagementRef>((_, ref) => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [accommodations, setAccommodations] = useState<AccommodationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [distributeOpen, setDistributeOpen] = useState(false);
  const [distributingCoupon, setDistributingCoupon] = useState<{ id: string; code: string } | null>(null);

  // Form state
  const [code, setCode] = useState("");
  const [couponType, setCouponType] = useState("fixed");
  const [couponValue, setCouponValue] = useState("");
  const [scope, setScope] = useState("platform");
  const [accommodationId, setAccommodationId] = useState<string>("");
  const [minOrderAmount, setMinOrderAmount] = useState("0");
  const [usageLimit, setUsageLimit] = useState("0");
  const [perMemberLimit, setPerMemberLimit] = useState("1");
  const [validFrom, setValidFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [validUntil, setValidUntil] = useState("");
  const [isActive, setIsActive] = useState(true);

  useImperativeHandle(ref, () => ({
    openCreateDialog: () => { resetForm(); setDialogOpen(true); },
  }));

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [couponsRes, accsRes] = await Promise.all([
      supabase.from("platform_coupons").select("*, accommodation_info(name)").order("created_at", { ascending: false }),
      supabase.from("accommodation_info").select("id, name").eq("is_active", true).order("name"),
    ]);

    setCoupons((couponsRes.data || []).map((c: any) => ({
      ...c,
      accommodation_name: c.accommodation_info?.name || null,
    })));
    setAccommodations(accsRes.data || []);
    setLoading(false);
  };

  const resetForm = () => {
    setEditing(null);
    setCode("");
    setCouponType("fixed");
    setCouponValue("");
    setScope("platform");
    setAccommodationId("");
    setMinOrderAmount("0");
    setUsageLimit("0");
    setPerMemberLimit("1");
    setValidFrom(format(new Date(), "yyyy-MM-dd"));
    setValidUntil("");
    setIsActive(true);
  };

  const openEditDialog = (coupon: Coupon) => {
    setEditing(coupon);
    setCode(coupon.code);
    setCouponType(coupon.coupon_type);
    setCouponValue(String(coupon.coupon_value));
    setScope(coupon.scope);
    setAccommodationId(coupon.accommodation_id || "");
    setMinOrderAmount(String(coupon.min_order_amount));
    setUsageLimit(String(coupon.usage_limit));
    setPerMemberLimit(String(coupon.per_member_limit));
    setValidFrom(format(new Date(coupon.valid_from), "yyyy-MM-dd"));
    setValidUntil(coupon.valid_until ? format(new Date(coupon.valid_until), "yyyy-MM-dd") : "");
    setIsActive(coupon.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!code || !couponValue) { toast.error("請填寫必要欄位"); return; }
    setSaving(true);
    try {
      const payload = {
        code: code.toUpperCase(),
        coupon_type: couponType as any,
        coupon_value: parseInt(couponValue),
        scope: scope as any,
        accommodation_id: scope === "accommodation" ? accommodationId || null : null,
        min_order_amount: parseInt(minOrderAmount) || 0,
        usage_limit: parseInt(usageLimit) || 0,
        per_member_limit: parseInt(perMemberLimit) || 1,
        valid_from: new Date(validFrom).toISOString(),
        valid_until: validUntil ? new Date(validUntil + "T23:59:59").toISOString() : null,
        is_active: isActive,
      };

      if (editing) {
        const { error } = await supabase.from("platform_coupons").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("優惠券已更新");
      } else {
        const { error } = await supabase.from("platform_coupons").insert(payload);
        if (error) throw error;
        toast.success("優惠券已建立");
      }
      setDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast.error(error.message || "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const { error } = await supabase.from("platform_coupons").delete().eq("id", deletingId);
    if (error) { toast.error("刪除失敗"); return; }
    toast.success("優惠券已刪除");
    setDeleteDialogOpen(false);
    loadData();
  };

  const filtered = coupons.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.code.toLowerCase().includes(q) || c.accommodation_name?.toLowerCase().includes(q);
  });

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜尋優惠券..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Badge variant="secondary">{coupons.length} 張優惠券</Badge>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Ticket} title="尚無優惠券" description="點擊右上角新增優惠券" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>優惠碼</TableHead>
                  <TableHead>類型</TableHead>
                  <TableHead>折扣值</TableHead>
                  <TableHead>範圍</TableHead>
                  <TableHead className="text-right">使用/上限</TableHead>
                  <TableHead>有效期</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(coupon => (
                  <TableRow key={coupon.id}>
                    <TableCell className="font-mono font-semibold">{coupon.code}</TableCell>
                    <TableCell>{coupon.coupon_type === "percentage" ? "折扣 %" : "固定金額"}</TableCell>
                    <TableCell>
                      {coupon.coupon_type === "percentage" ? `${coupon.coupon_value}%` : `NT$ ${coupon.coupon_value}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {coupon.scope === "platform" ? "全平台" : coupon.accommodation_name || "指定民宿"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{coupon.used_count} / {coupon.usage_limit || "∞"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {coupon.valid_until ? format(new Date(coupon.valid_until), "yyyy/MM/dd") : "無期限"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={coupon.is_active ? "default" : "secondary"}>
                        {coupon.is_active ? "啟用" : "停用"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="發送優惠券"
                          onClick={() => {
                            setDistributingCoupon({ id: coupon.id, code: coupon.code });
                            setDistributeOpen(true);
                          }}
                        >
                          <Send className="h-4 w-4 text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(coupon)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { setDeletingId(coupon.id); setDeleteDialogOpen(true); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯優惠券" : "新增優惠券"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>優惠碼</Label>
                <Input value={code} onChange={e => setCode(e.target.value)} placeholder="WELCOME10" />
              </div>
              <div className="space-y-2">
                <Label>折扣類型</Label>
                <Select value={couponType} onValueChange={setCouponType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">固定金額</SelectItem>
                    <SelectItem value="percentage">百分比</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>折扣值</Label>
                <Input type="number" value={couponValue} onChange={e => setCouponValue(e.target.value)} placeholder={couponType === "percentage" ? "10" : "500"} />
              </div>
              <div className="space-y-2">
                <Label>適用範圍</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="platform">全平台</SelectItem>
                    <SelectItem value="accommodation">指定民宿</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {scope === "accommodation" && (
              <div className="space-y-2">
                <Label>指定民宿</Label>
                <Select value={accommodationId} onValueChange={setAccommodationId}>
                  <SelectTrigger><SelectValue placeholder="選擇民宿" /></SelectTrigger>
                  <SelectContent>
                    {accommodations.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>最低消費</Label>
                <Input type="number" value={minOrderAmount} onChange={e => setMinOrderAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>使用上限（0=無限）</Label>
                <Input type="number" value={usageLimit} onChange={e => setUsageLimit(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>每人限用次數</Label>
              <Input type="number" value={perMemberLimit} onChange={e => setPerMemberLimit(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>生效日期</Label>
                <Input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>到期日期（空=無期限）</Label>
                <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>啟用</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "更新" : "建立"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>確定要刪除此優惠券嗎？此操作無法復原。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CouponDistributeDialog
        open={distributeOpen}
        onOpenChange={setDistributeOpen}
        coupon={distributingCoupon}
      />
    </div>
  );
});

CouponManagement.displayName = "CouponManagement";
