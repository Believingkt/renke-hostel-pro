import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShoppingBag, Calendar, MapPin } from "lucide-react";
import { format } from "date-fns";

interface MemberOrder {
  id: string;
  order_number: string;
  check_in_date: string;
  check_out_date: string;
  order_status: string;
  final_price: number;
  guest_name: string;
  accommodation_name: string;
  room_type_name: string | null;
}

const statusLabels: Record<string, string> = {
  pending: "待確認",
  confirmed: "已確認",
  checked_in: "已入住",
  checked_out: "已退房",
  cancelled: "已取消",
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-green-100 text-green-800",
  checked_in: "bg-blue-100 text-blue-800",
  checked_out: "bg-gray-100 text-gray-800",
  cancelled: "bg-red-100 text-red-800",
};

const MemberOrders = () => {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<MemberOrder[]>([]);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: member } = await supabase
      .from("platform_members")
      .select("id, email, phone, name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) { setLoading(false); return; }

    // Find orders by email or phone
    const conditions: string[] = [];
    if (member.email) conditions.push(`guest_email.eq.${member.email}`);
    if (member.phone) conditions.push(`guest_phone.eq.${member.phone}`);

    if (conditions.length === 0) { setLoading(false); return; }

    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, check_in_date, check_out_date, order_status, final_price, guest_name, accommodation_id, room_types(name)")
      .or(conditions.join(","))
      .order("check_in_date", { ascending: false })
      .limit(50);

    if (error) { console.error(error); setLoading(false); return; }

    // Get accommodation names
    const accIds = [...new Set((data || []).map((o) => o.accommodation_id))];
    const { data: accs } = await supabase
      .from("accommodation_info")
      .select("id, name")
      .in("id", accIds);
    const accMap = new Map((accs || []).map((a) => [a.id, a.name]));

    setOrders(
      (data || []).map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        check_in_date: o.check_in_date,
        check_out_date: o.check_out_date,
        order_status: o.order_status,
        final_price: o.final_price,
        guest_name: o.guest_name,
        accommodation_name: accMap.get(o.accommodation_id) || "",
        room_type_name: o.room_types?.name || null,
      }))
    );
    setLoading(false);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5" />
          訂房紀錄
        </CardTitle>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">尚無訂房紀錄</p>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{order.accommodation_name}</p>
                    <p className="text-sm text-muted-foreground">{order.room_type_name || "—"}</p>
                  </div>
                  <div className="text-right">
                    <Badge className={statusColors[order.order_status] || ""}>
                      {statusLabels[order.order_status] || order.order_status}
                    </Badge>
                    <p className="font-semibold mt-1">NT$ {order.final_price.toLocaleString()}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {format(new Date(order.check_in_date), "MM/dd")} — {format(new Date(order.check_out_date), "MM/dd")}
                  </span>
                  <span className="font-mono text-xs">{order.order_number}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MemberOrders;
