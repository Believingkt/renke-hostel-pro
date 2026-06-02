import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Copy, ExternalLink, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface StagingData {
  id: string;
  obe_number: string | null;
  accommodation_name: string | null;
  room_type_name: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  guest_count: number | null;
  total_amount: number | null;
  currency: string | null;
  pii_due_at: string | null;
}

interface AccInfo { id: string; name: string | null; short_url_alias: string | null; }
interface RoomType { id: string; name: string; base_price: number; }

const OWLNEST_ADMIN_URL = "https://www.owlting.com/booking/admin/?l=zh_TW&p=order";

export default function OwlTingFillup() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staging, setStaging] = useState<StagingData | null>(null);
  const [acc, setAcc] = useState<AccInfo | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);

  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [roomTypeId, setRoomTypeId] = useState<string>("none");
  const [totalAmountOverride, setTotalAmountOverride] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState<{ id: string; order_number: string } | null>(null);

  useEffect(() => {
    if (!token) { setError("缺少 token"); setLoading(false); return; }
    (async () => {
      try {
        const { data, error: invokeErr } = await supabase.functions.invoke("owlting-fillup-validate", {
          body: { token },
        });
        if (invokeErr || !data?.ok) {
          setError(data?.error || invokeErr?.message || "驗證失敗");
        } else {
          setStaging(data.staging);
          setAcc(data.accommodation);
          setRoomTypes(data.room_types || []);
          if (data.staging?.total_amount) setTotalAmountOverride(String(data.staging.total_amount));
        }
      } catch (e: any) {
        setError(e.message ?? "驗證失敗");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const copyObe = () => {
    if (!staging?.obe_number) return;
    navigator.clipboard.writeText(staging.obe_number);
    toast({ title: "已複製訂單編號" });
  };

  const handleSubmit = async () => {
    if (!guestName.trim() || !guestPhone.trim()) {
      toast({ title: "請填寫姓名與電話", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke("owlting-fillup-submit", {
        body: {
          token,
          guest_name: guestName.trim(),
          guest_phone: guestPhone.trim(),
          guest_email: guestEmail.trim(),
          room_type_id: roomTypeId !== "none" ? roomTypeId : null,
          total_amount: totalAmountOverride ? Number(totalAmountOverride) : null,
        },
      });
      if (invokeErr || !data?.ok) {
        toast({ title: "送出失敗", description: data?.error || invokeErr?.message, variant: "destructive" });
      } else {
        setSubmittedOrder({ id: data.order_id, order_number: data.order_number });
        toast({ title: "訂單已建立" });
      }
    } catch (e: any) {
      toast({ title: "送出失敗", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">無法開啟補單頁</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            <p className="text-xs text-muted-foreground">如需協助請聯絡客服</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submittedOrder) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
            <h2 className="text-lg font-semibold">訂單已建立</h2>
            <p className="text-sm">訂單編號：<strong className="font-mono">{submittedOrder.order_number}</strong></p>
            <p className="text-xs text-muted-foreground">系統將自動寄送抵達指引給住客。此連結已失效。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{acc?.name ?? staging?.accommodation_name ?? "民宿"}：奧丁丁訂單補單</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <div className="text-xs text-muted-foreground">奧丁丁訂單編號</div>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold font-mono">{staging?.obe_number ?? "—"}</div>
                <Button size="sm" variant="outline" onClick={copyObe}>
                  <Copy className="h-3.5 w-3.5 mr-1" />複製
                </Button>
              </div>
              <Button size="sm" variant="outline" asChild className="w-full sm:w-auto">
                <a href={OWLNEST_ADMIN_URL} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />開奧丁丁系統訂單列表
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">
                到奧丁丁系統後台搜尋上方訂單編號，把住客姓名、電話、Email 複製貼到下方欄位。
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">入住：</span>{staging?.check_in_date ?? "—"}</div>
              <div><span className="text-muted-foreground">退房：</span>{staging?.check_out_date ?? "—"}</div>
              <div><span className="text-muted-foreground">人數：</span>{staging?.guest_count ?? "—"}</div>
              <div><span className="text-muted-foreground">原房型：</span>{staging?.room_type_name ?? "—"}</div>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="guest_name">住客姓名 <span className="text-destructive">*</span></Label>
                <Input id="guest_name" value={guestName} onChange={(e) => setGuestName(e.target.value.trim())}
                  autoComplete="off" placeholder="王小明" />
              </div>
              <div>
                <Label htmlFor="guest_phone">電話 <span className="text-destructive">*</span></Label>
                <Input id="guest_phone" type="tel" inputMode="tel" value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value.trim())}
                  autoComplete="off" placeholder="0912345678" />
              </div>
              <div>
                <Label htmlFor="guest_email">Email</Label>
                <Input id="guest_email" type="email" inputMode="email" value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value.trim())}
                  autoComplete="off" placeholder="guest@example.com（可選，用於寄抵達指引）" />
              </div>
              <div>
                <Label>對應房型（選填）</Label>
                <Select value={roomTypeId} onValueChange={setRoomTypeId}>
                  <SelectTrigger><SelectValue placeholder="不指定" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不指定（保留待後台處理）</SelectItem>
                    {roomTypes.map((rt) => (
                      <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="total_amount">訂單金額（OwlNest 顯示金額）</Label>
                <Input id="total_amount" type="number" inputMode="numeric" value={totalAmountOverride}
                  onChange={(e) => setTotalAmountOverride(e.target.value)} placeholder="如不確定可留 0" />
              </div>
            </div>

            <Button onClick={handleSubmit} disabled={submitting} className="w-full">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              送出並建立訂單
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              送出後系統自動建立訂單並寄送抵達指引；此連結 48 小時內有效、限本人使用，填完後立即失效。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
