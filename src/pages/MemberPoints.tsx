import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Gift, TrendingUp, TrendingDown } from "lucide-react";
import { format } from "date-fns";

interface PointTransaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
}

const typeLabels: Record<string, string> = {
  earn_order: "消費回饋",
  earn_event: "活動贈點",
  redeem: "點數兌換",
  expire: "點數過期",
  admin_adjust: "管理員調整",
};

const MemberPoints = () => {
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [lifetimeEarned, setLifetimeEarned] = useState(0);
  const [lifetimeUsed, setLifetimeUsed] = useState(0);
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);

  useEffect(() => {
    loadPoints();
  }, []);

  const loadPoints = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: member } = await supabase
      .from("platform_members")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) { setLoading(false); return; }

    const [pointsRes, txRes] = await Promise.all([
      supabase.from("member_points").select("*").eq("member_id", member.id).maybeSingle(),
      supabase.from("member_point_transactions").select("*").eq("member_id", member.id).order("created_at", { ascending: false }).limit(50),
    ]);

    if (pointsRes.data) {
      setBalance(pointsRes.data.balance);
      setLifetimeEarned(pointsRes.data.lifetime_earned);
      setLifetimeUsed(pointsRes.data.lifetime_used);
    }
    if (txRes.data) setTransactions(txRes.data);
    setLoading(false);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center">
          <CardContent className="pt-6">
            <Gift className="h-8 w-8 mx-auto mb-2" style={{ color: "hsl(24, 100%, 50%)" }} />
            <p className="text-2xl font-bold">{balance.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">目前餘額</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-6">
            <TrendingUp className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p className="text-2xl font-bold">{lifetimeEarned.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">累計獲得</p>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-6">
            <TrendingDown className="h-8 w-8 mx-auto mb-2 text-blue-500" />
            <p className="text-2xl font-bold">{lifetimeUsed.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">累計使用</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle>異動紀錄</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">尚無點數異動紀錄</p>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={tx.amount > 0 ? "default" : "secondary"} className="text-xs">
                        {typeLabels[tx.type] || tx.type}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(tx.created_at), "yyyy/MM/dd HH:mm")}
                      </span>
                    </div>
                    {tx.description && (
                      <p className="text-sm text-muted-foreground mt-1">{tx.description}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${tx.amount > 0 ? "text-green-600" : "text-red-500"}`}>
                      {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">餘額 {tx.balance_after.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MemberPoints;
