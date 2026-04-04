import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Gift, Search, Plus, Users } from "lucide-react";
import { format } from "date-fns";
import { EmptyState } from "@/components/EmptyState";

interface Member {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
  points_balance: number;
  lifetime_earned: number;
}

export interface MemberManagementRef {
  refresh: () => void;
}

export const MemberManagement = forwardRef<MemberManagementRef>((_, ref) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [grantAmount, setGrantAmount] = useState("");
  const [grantDescription, setGrantDescription] = useState("");
  const [granting, setGranting] = useState(false);

  useImperativeHandle(ref, () => ({ refresh: loadMembers }));

  useEffect(() => { loadMembers(); }, []);

  const loadMembers = async () => {
    setLoading(true);
    const { data: mems, error } = await supabase
      .from("platform_members")
      .select("id, user_id, name, phone, email, created_at")
      .order("created_at", { ascending: false });

    if (error) { console.error(error); setLoading(false); return; }

    // Get points for each member
    const memberIds = (mems || []).map(m => m.id);
    const { data: points } = await supabase
      .from("member_points")
      .select("member_id, balance, lifetime_earned")
      .in("member_id", memberIds);

    const pointsMap = new Map((points || []).map(p => [p.member_id, p]));

    setMembers((mems || []).map(m => ({
      ...m,
      points_balance: pointsMap.get(m.id)?.balance || 0,
      lifetime_earned: pointsMap.get(m.id)?.lifetime_earned || 0,
    })));
    setLoading(false);
  };

  const handleGrantPoints = async () => {
    if (!selectedMember || !grantAmount) return;
    const amount = parseInt(grantAmount);
    if (isNaN(amount) || amount <= 0) { toast.error("請輸入有效的點數"); return; }

    setGranting(true);
    try {
      const currentBalance = selectedMember.points_balance;
      const newBalance = currentBalance + amount;

      const { error: txError } = await supabase
        .from("member_point_transactions")
        .insert({
          member_id: selectedMember.id,
          type: "earn_event" as any,
          amount,
          balance_after: newBalance,
          description: grantDescription || "管理員手動贈點",
        });
      if (txError) throw txError;

      // Update balance - use RPC or direct update via super_admin policy
      const { error: updateError } = await supabase
        .from("member_points")
        .update({
          balance: newBalance,
          lifetime_earned: selectedMember.lifetime_earned + amount,
        })
        .eq("member_id", selectedMember.id);
      if (updateError) throw updateError;

      toast.success(`已成功贈送 ${amount} 點給 ${selectedMember.name}`);
      setGrantDialogOpen(false);
      setGrantAmount("");
      setGrantDescription("");
      loadMembers();
    } catch (error: any) {
      toast.error(error.message || "贈點失敗");
    } finally {
      setGranting(false);
    }
  };

  const filtered = members.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q) || m.phone?.includes(q);
  });

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜尋會員..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Badge variant="secondary">{members.length} 位會員</Badge>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="尚無會員" description="會員註冊後將顯示在此" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>手機</TableHead>
                  <TableHead className="text-right">點數餘額</TableHead>
                  <TableHead className="text-right">累計獲得</TableHead>
                  <TableHead>註冊時間</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(member => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.name || "—"}</TableCell>
                    <TableCell className="text-sm">{member.email || "—"}</TableCell>
                    <TableCell className="text-sm">{member.phone || "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{member.points_balance.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{member.lifetime_earned.toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(member.created_at), "yyyy/MM/dd")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setSelectedMember(member); setGrantDialogOpen(true); }}
                        className="gap-1"
                      >
                        <Gift className="h-3.5 w-3.5" />
                        贈點
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Grant Points Dialog */}
      <Dialog open={grantDialogOpen} onOpenChange={setGrantDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>手動贈點</DialogTitle>
            <DialogDescription>
              贈送紅利點數給 {selectedMember?.name}（目前餘額：{selectedMember?.points_balance.toLocaleString()} 點）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>贈送點數</Label>
              <Input type="number" min="1" value={grantAmount} onChange={e => setGrantAmount(e.target.value)} placeholder="輸入點數" />
            </div>
            <div className="space-y-2">
              <Label>說明（選填）</Label>
              <Input value={grantDescription} onChange={e => setGrantDescription(e.target.value)} placeholder="例：活動贈點" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantDialogOpen(false)}>取消</Button>
            <Button onClick={handleGrantPoints} disabled={granting || !grantAmount}>
              {granting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              確認贈送
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

MemberManagement.displayName = "MemberManagement";
