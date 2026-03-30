import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Copy, Eye, EyeOff, Loader2, Trash2, ExternalLink, Handshake, FileText, ArrowDownUp } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

interface PointTransaction {
  id: string;
  order_id: string | null;
  external_user_id: string;
  external_transaction_id: string | null;
  points_amount: number;
  currency_amount: number;
  transaction_type: string;
  status: string;
  created_at: string;
  metadata: any;
  orders: {
    order_number: string;
    guest_name: string;
    check_in_date: string;
    check_out_date: string;
    final_price: number;
    order_status: string;
    room_types: { name: string } | null;
    accommodation_id: string;
  } | null;
}

interface Partner {
  id: string;
  platform_name: string;
  platform_code: string;
  api_key: string;
  is_active: boolean;
  point_to_currency_rate: number;
  webhook_url: string | null;
  webhook_secret: string | null;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
}

export interface PartnerManagementRef {
  openCreateDialog: () => void;
}

export const PartnerManagement = forwardRef<PartnerManagementRef>((_, ref) => {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  // Form state
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formRate, setFormRate] = useState("1");
  const [formEmail, setFormEmail] = useState("");
  const [formWebhook, setFormWebhook] = useState("");
  const [formNotes, setFormNotes] = useState("");

  useImperativeHandle(ref, () => ({
    openCreateDialog: () => setShowCreateDialog(true),
  }));

  useEffect(() => {
    loadPartners();
  }, []);

  const loadPartners = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("points_platform_partners")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("載入合作夥伴失敗");
      console.error(error);
    } else {
      setPartners((data as any) || []);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formCode.trim()) {
      toast.error("請填寫平台名稱和代碼");
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.from("points_platform_partners").insert({
      platform_name: formName.trim(),
      platform_code: formCode.trim().toLowerCase(),
      point_to_currency_rate: parseFloat(formRate) || 1,
      contact_email: formEmail.trim() || null,
      webhook_url: formWebhook.trim() || null,
      notes: formNotes.trim() || null,
    });

    if (error) {
      if (error.code === "23505") {
        toast.error("平台代碼已存在");
      } else {
        toast.error("建立失敗：" + error.message);
      }
    } else {
      toast.success("合作夥伴已建立");
      setShowCreateDialog(false);
      resetForm();
      loadPartners();
    }
    setIsSubmitting(false);
  };

  const toggleActive = async (partner: Partner) => {
    const { error } = await supabase
      .from("points_platform_partners")
      .update({ is_active: !partner.is_active })
      .eq("id", partner.id);

    if (error) {
      toast.error("更新失敗");
    } else {
      toast.success(partner.is_active ? "已停用" : "已啟用");
      loadPartners();
    }
  };

  const deletePartner = async (partner: Partner) => {
    if (!confirm(`確定要刪除「${partner.platform_name}」？此操作無法復原。`)) return;

    const { error } = await supabase
      .from("points_platform_partners")
      .delete()
      .eq("id", partner.id);

    if (error) {
      toast.error("刪除失敗：" + error.message);
    } else {
      toast.success("已刪除");
      loadPartners();
    }
  };

  const copyApiKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("API Key 已複製");
  };

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetForm = () => {
    setFormName("");
    setFormCode("");
    setFormRate("1");
    setFormEmail("");
    setFormWebhook("");
    setFormNotes("");
  };

  const maskKey = (key: string) => key.slice(0, 8) + "••••••••" + key.slice(-8);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {partners.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="尚未建立合作夥伴"
          description="新增點數平台合作夥伴，讓會員可透過點數訂房"
          action={{ label: "新增合作夥伴", onClick: () => setShowCreateDialog(true) }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">合作夥伴列表</CardTitle>
            <CardDescription>管理點數平台串接的合作夥伴及 API 金鑰</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>平台名稱</TableHead>
                    <TableHead>代碼</TableHead>
                    <TableHead>兌換比率</TableHead>
                    <TableHead>API Key</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <div>
                          {p.platform_name}
                          {p.contact_email && (
                            <p className="text-xs text-muted-foreground">{p.contact_email}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{p.platform_code}</code>
                      </TableCell>
                      <TableCell>1 點 = {p.point_to_currency_rate} 元</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded max-w-[200px] truncate">
                            {visibleKeys.has(p.id) ? p.api_key : maskKey(p.api_key)}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => toggleKeyVisibility(p.id)}
                          >
                            {visibleKeys.has(p.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyApiKey(p.api_key)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={p.is_active}
                            onCheckedChange={() => toggleActive(p)}
                          />
                          <Badge variant={p.is_active ? "default" : "secondary"}>
                            {p.is_active ? "啟用" : "停用"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => window.open("/points-api-docs", "_blank")}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => deletePartner(p)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增合作夥伴</DialogTitle>
            <DialogDescription>建立新的點數平台合作夥伴，系統將自動產生 API Key</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>平台名稱 *</Label>
              <Input placeholder="例如：StarChain 星鏈" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>平台代碼 *</Label>
              <Input placeholder="例如：starchain（英文小寫）" value={formCode} onChange={(e) => setFormCode(e.target.value)} />
              <p className="text-xs text-muted-foreground">用於訂單來源識別，建立後不可修改</p>
            </div>
            <div className="space-y-2">
              <Label>兌換比率（1 點 = ? 元）</Label>
              <Input type="number" min="0.01" step="0.01" value={formRate} onChange={(e) => setFormRate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>聯絡 Email</Label>
              <Input type="email" placeholder="partner@example.com" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <Input placeholder="https://..." value={formWebhook} onChange={(e) => setFormWebhook(e.target.value)} />
              <p className="text-xs text-muted-foreground">訂單建立/取消時會發送通知至此 URL</p>
            </div>
            <div className="space-y-2">
              <Label>備註</Label>
              <Input placeholder="備註說明" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              建立
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

PartnerManagement.displayName = "PartnerManagement";
