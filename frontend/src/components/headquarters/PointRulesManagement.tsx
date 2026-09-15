import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, Settings } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

interface PointRule {
  id: string;
  accommodation_id: string | null;
  earn_rate: number;
  min_order_amount: number;
  points_per_dollar: number;
  is_active: boolean;
  accommodation_name?: string;
}

interface AccommodationOption {
  id: string;
  name: string;
}

const PointRulesManagement = () => {
  const [rules, setRules] = useState<PointRule[]>([]);
  const [accommodations, setAccommodations] = useState<AccommodationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PointRule | null>(null);
  const [saving, setSaving] = useState(false);

  // Form
  const [accommodationId, setAccommodationId] = useState<string>("platform");
  const [earnRate, setEarnRate] = useState("0.05");
  const [minOrderAmount, setMinOrderAmount] = useState("0");
  const [pointsPerDollar, setPointsPerDollar] = useState("1");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [rulesRes, accsRes] = await Promise.all([
      supabase.from("point_rules").select("*, accommodation_info(name)").order("created_at", { ascending: false }),
      supabase.from("accommodation_info").select("id, name").eq("is_active", true).order("name"),
    ]);

    setRules((rulesRes.data || []).map((r: any) => ({
      ...r,
      accommodation_name: r.accommodation_info?.name || null,
    })));
    setAccommodations(accsRes.data || []);
    setLoading(false);
  };

  const resetForm = () => {
    setEditing(null);
    setAccommodationId("platform");
    setEarnRate("0.05");
    setMinOrderAmount("0");
    setPointsPerDollar("1");
    setIsActive(true);
  };

  const openEditDialog = (rule: PointRule) => {
    setEditing(rule);
    setAccommodationId(rule.accommodation_id || "platform");
    setEarnRate(String(rule.earn_rate));
    setMinOrderAmount(String(rule.min_order_amount));
    setPointsPerDollar(String(rule.points_per_dollar));
    setIsActive(rule.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        accommodation_id: accommodationId === "platform" ? null : accommodationId,
        earn_rate: parseFloat(earnRate),
        min_order_amount: parseInt(minOrderAmount) || 0,
        points_per_dollar: parseFloat(pointsPerDollar),
        is_active: isActive,
      };

      if (editing) {
        const { error } = await supabase.from("point_rules").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("規則已更新");
      } else {
        const { error } = await supabase.from("point_rules").insert(payload);
        if (error) throw error;
        toast.success("規則已建立");
      }
      setDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast.error(error.message || "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("point_rules").delete().eq("id", id);
    if (error) { toast.error("刪除失敗"); return; }
    toast.success("規則已刪除");
    loadData();
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          設定消費回饋比例，當訂單狀態變為「已退房」時自動發放點數
        </p>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          新增規則
        </Button>
      </div>

      {rules.length === 0 ? (
        <EmptyState icon={Settings} title="尚無點數規則" description="新增規則以啟用消費回饋" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>適用範圍</TableHead>
                  <TableHead>回饋比例</TableHead>
                  <TableHead>每元回饋點數</TableHead>
                  <TableHead>最低消費</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map(rule => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <Badge variant="secondary">
                        {rule.accommodation_id ? rule.accommodation_name || "指定民宿" : "全平台通用"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold">{(rule.earn_rate * 100).toFixed(1)}%</TableCell>
                    <TableCell>{rule.points_per_dollar}</TableCell>
                    <TableCell>NT$ {rule.min_order_amount.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={rule.is_active ? "default" : "secondary"}>
                        {rule.is_active ? "啟用" : "停用"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(rule)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(rule.id)}>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">回饋計算公式</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            回饋點數 = 訂單實付金額 × 回饋比例 × 每元回饋點數<br />
            例：實付 NT$5,000，回饋比例 5%，每元 1 點 → 回饋 250 點
          </p>
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "編輯規則" : "新增點數規則"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>適用範圍</Label>
              <Select value={accommodationId} onValueChange={setAccommodationId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="platform">全平台通用</SelectItem>
                  {accommodations.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>回饋比例</Label>
                <Input type="number" step="0.01" value={earnRate} onChange={e => setEarnRate(e.target.value)} />
                <p className="text-xs text-muted-foreground">0.05 = 5%</p>
              </div>
              <div className="space-y-2">
                <Label>每元回饋點數</Label>
                <Input type="number" step="0.1" value={pointsPerDollar} onChange={e => setPointsPerDollar(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>最低消費門檻</Label>
              <Input type="number" value={minOrderAmount} onChange={e => setMinOrderAmount(e.target.value)} />
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
    </div>
  );
};

export default PointRulesManagement;
