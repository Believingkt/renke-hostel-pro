import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Ticket, Clock } from "lucide-react";
import { format } from "date-fns";

interface Coupon {
  id: string;
  code: string;
  coupon_type: string;
  coupon_value: number;
  scope: string;
  min_order_amount: number;
  valid_from: string;
  valid_until: string | null;
  accommodation_name?: string;
  is_distributed?: boolean;
  distribution_note?: string | null;
}

const MemberCoupons = () => {
  const [loading, setLoading] = useState(true);
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  useEffect(() => {
    loadCoupons();
  }, []);

  const loadCoupons = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1) Public active coupons
      const publicRes = await supabase
        .from("platform_coupons")
        .select("*, accommodation_info(name)")
        .eq("is_active", true)
        .gte("valid_until", new Date().toISOString())
        .order("created_at", { ascending: false });

      const publicCoupons: Coupon[] = (publicRes.data || []).map((c: any) => ({
        ...c,
        accommodation_name: c.accommodation_info?.name || null,
        is_distributed: false,
      }));

      // 2) Distributed coupons (member-specific)
      let distributedCoupons: Coupon[] = [];
      if (user) {
        const { data: member } = await supabase
          .from("platform_members")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (member) {
          const { data: dists } = await supabase
            .from("member_coupon_distributions")
            .select("distribution_note, is_used, platform_coupons(*, accommodation_info(name))")
            .eq("member_id", member.id)
            .eq("is_used", false);

          distributedCoupons = (dists || [])
            .filter((d: any) => d.platform_coupons?.is_active)
            .map((d: any) => ({
              ...d.platform_coupons,
              accommodation_name: d.platform_coupons?.accommodation_info?.name || null,
              is_distributed: true,
              distribution_note: d.distribution_note,
            }));
        }
      }

      // Merge — distributed first, dedupe by id
      const seen = new Set<string>();
      const merged: Coupon[] = [];
      for (const c of [...distributedCoupons, ...publicCoupons]) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        merged.push(c);
      }
      setCoupons(merged);
    } catch (error) {
      console.error("Failed to load coupons:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            可用優惠券
          </CardTitle>
        </CardHeader>
        <CardContent>
          {coupons.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">目前沒有可用的優惠券</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {coupons.map((coupon) => (
                <div
                  key={coupon.id}
                  className="relative border rounded-lg p-4 bg-gradient-to-r from-orange-50 to-white overflow-hidden"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-[hsl(24,100%,50%)]" />
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-lg" style={{ color: "hsl(24, 100%, 50%)" }}>
                        {coupon.coupon_type === "percentage"
                          ? `${coupon.coupon_value}% OFF`
                          : `NT$ ${coupon.coupon_value}`}
                      </p>
                      <p className="text-sm font-mono mt-1 bg-muted px-2 py-0.5 rounded inline-block">
                        {coupon.code}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {coupon.is_distributed && (
                        <Badge className="text-[10px] bg-[hsl(24,100%,50%)] hover:bg-[hsl(24,100%,50%)]">
                          專屬發送
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {coupon.scope === "platform" ? "全平台" : coupon.accommodation_name || "指定民宿"}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground space-y-1">
                    {coupon.min_order_amount > 0 && (
                      <p>滿 NT$ {coupon.min_order_amount.toLocaleString()} 可用</p>
                    )}
                    <p className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {coupon.valid_until
                        ? `有效至 ${format(new Date(coupon.valid_until), "yyyy/MM/dd")}`
                        : "無期限"}
                    </p>
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

export default MemberCoupons;
