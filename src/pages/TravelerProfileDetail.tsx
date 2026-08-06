import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAliasPrefix } from "@/hooks/use-alias-prefix";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, X, RefreshCw } from "lucide-react";
import type { TravelerProfile } from "@/types/traveler";
import { identityLabel, formatDateTime } from "@/types/traveler";

interface OrderRow {
  id: string;
  order_number: string;
  check_in_date: string;
  final_price: number;
  order_status: string;
  discount_code: string | null;
}

export default function TravelerProfileDetail() {
  const { travelerId } = useParams();
  const navigate = useNavigate();
  const { withPrefix } = useAliasPrefix();
  const [profile, setProfile] = useState<TravelerProfile | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [newTag, setNewTag] = useState("");
  const [newNeed, setNewNeed] = useState("");
  const [tagging, setTagging] = useState(false);

  const load = async () => {
    if (!travelerId) return;
    const { data, error } = await supabase
      .from("traveler_profiles")
      .select("*")
      .eq("id", travelerId)
      .maybeSingle();
    if (error || !data) {
      toast({ title: "找不到旅客檔案", description: error?.message, variant: "destructive" });
      return;
    }
    const p = data as unknown as TravelerProfile;
    setProfile(p);

    const filters: string[] = [];
    if (p.email) filters.push(`guest_email.ilike.${p.email}`);
    if (p.phone) filters.push(`guest_phone.ilike.%${p.phone.slice(-8)}`);
    if (filters.length) {
      const { data: od } = await supabase
        .from("orders")
        .select("id,order_number,check_in_date,final_price,order_status,discount_code")
        .or(filters.join(","))
        .order("check_in_date", { ascending: false })
        .limit(100);
      setOrders((od ?? []) as OrderRow[]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travelerId]);

  const save = async (patch: Partial<Pick<TravelerProfile, "interest_tags" | "custom_needs">>) => {
    if (!profile) return;
    const { error } = await supabase.from("traveler_profiles").update(patch).eq("id", profile.id);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
      return;
    }
    setProfile({ ...profile, ...patch } as TravelerProfile);
    toast({ title: "已儲存" });
  };

  const runTagging = async () => {
    if (!profile) return;
    setTagging(true);
    const { data, error } = await supabase.functions.invoke("traveler-tagging", {
      body: { traveler_id: profile.id, limit: 1 },
    });
    setTagging(false);
    if (error || (data as any)?.error) {
      toast({ title: "解析失敗", description: error?.message ?? (data as any)?.error, variant: "destructive" });
      return;
    }
    toast({ title: "AI 標籤解析完成", description: (data as any)?.note ?? "已更新標籤" });
    load();
  };

  if (!profile) return null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(withPrefix("/admin/cdp"))}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{profile.display_name || profile.customer_key}</h1>
            <p className="text-sm text-muted-foreground">
              {profile.customer_key}　最後同步：{formatDateTime(profile.last_synced_at) || "－"}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={runTagging} disabled={tagging}>
          <RefreshCw className={`mr-2 h-4 w-4 ${tagging ? "animate-spin" : ""}`} />
          重新 AI 解析
        </Button>
      </div>

      {/* ① 綁定身分 */}
      <Card>
        <CardHeader><CardTitle className="text-base">① 綁定身分</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(profile.bound_identities ?? []).length === 0 && (
            <span className="text-sm text-muted-foreground">尚無綁定身分</span>
          )}
          {(profile.bound_identities ?? []).map((i, idx) => (
            <Badge key={idx} variant="secondary" className="text-sm">
              {identityLabel(i.type)}：{i.label || i.ref}
            </Badge>
          ))}
        </CardContent>
      </Card>

      {/* ② AI 標籤與客製化需求 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">② AI 興趣標籤</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(profile.interest_tags ?? []).map((t) => (
                <Badge key={t} className="gap-1 text-sm">
                  {t}
                  <button
                    onClick={() => save({ interest_tags: profile.interest_tags.filter((x) => x !== t) })}
                    aria-label={`移除 ${t}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {(profile.interest_tags ?? []).length === 0 && (
                <span className="text-sm text-muted-foreground">尚無標籤</span>
              )}
            </div>
            <div className="flex gap-2">
              <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="新增標籤" />
              <Button
                variant="outline"
                onClick={() => {
                  const v = newTag.trim();
                  if (!v || profile.interest_tags.includes(v)) return;
                  save({ interest_tags: [...profile.interest_tags, v] });
                  setNewTag("");
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">客製化需求</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {(profile.custom_needs ?? []).map((n) => (
                <div key={n} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
                  <span className="min-w-0 break-words">{n}</span>
                  <button
                    onClick={() => save({ custom_needs: profile.custom_needs.filter((x) => x !== n) })}
                    aria-label="移除需求"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              ))}
              {(profile.custom_needs ?? []).length === 0 && (
                <span className="text-sm text-muted-foreground">尚無記錄</span>
              )}
            </div>
            <div className="flex gap-2">
              <Input value={newNeed} onChange={(e) => setNewNeed(e.target.value)} placeholder="新增需求" />
              <Button
                variant="outline"
                onClick={() => {
                  const v = newNeed.trim();
                  if (!v || profile.custom_needs.includes(v)) return;
                  save({ custom_needs: [...profile.custom_needs, v] });
                  setNewNeed("");
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ③ 交易摘要與訂單 */}
      <Card>
        <CardHeader><CardTitle className="text-base">③ 交易摘要與訂單</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { label: "消費總額", value: `NT$ ${(profile.consumption?.total_amount ?? 0).toLocaleString()}` },
              { label: "訂單次數", value: profile.consumption?.order_count ?? 0 },
              { label: "平均金額", value: `NT$ ${(profile.consumption?.avg_amount ?? 0).toLocaleString()}` },
              { label: "最近消費", value: profile.consumption?.last_order_at?.slice(0, 10) ?? "－" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border p-3">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-lg font-semibold tabular-nums">{s.value}</p>
              </div>
            ))}
          </div>

          {(profile.consumption?.used_discount_codes ?? []).length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">使用過的折扣碼：</span>
              {profile.consumption!.used_discount_codes!.map((c) => (
                <Badge key={c} variant="outline">{c}</Badge>
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">訂單編號</TableHead>
                  <TableHead className="w-[120px]">入住日</TableHead>
                  <TableHead className="w-[120px] text-right">金額</TableHead>
                  <TableHead className="w-[100px]">狀態</TableHead>
                  <TableHead className="w-[120px]">折扣碼</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow
                    key={o.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => navigate(withPrefix(`/admin/orders/${o.id}`))}
                  >
                    <TableCell className="font-medium whitespace-nowrap">{o.order_number}</TableCell>
                    <TableCell className="whitespace-nowrap">{o.check_in_date}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      NT$ {Number(o.final_price || 0).toLocaleString()}
                    </TableCell>
                    <TableCell>{o.order_status}</TableCell>
                    <TableCell>{o.discount_code || "－"}</TableCell>
                  </TableRow>
                ))}
                {orders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      尚無訂單
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
