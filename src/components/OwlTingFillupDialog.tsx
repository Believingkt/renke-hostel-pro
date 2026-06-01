import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stagingId: string | null;
  onSubmitted?: () => void;
}

interface StagingData {
  id: string;
  obe_number: string | null;
  accommodation_name: string | null;
  room_type_name: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  guest_count: number | null;
  total_amount: number | null;
}
interface AccInfo { id: string; name: string | null; }
interface RoomType { id: string; name: string; base_price: number; }

const OWLNEST_ADMIN_URL = "https://www.owlting.com/booking/admin/?l=zh_TW&p=order";

export function OwlTingFillupDialog({ open, onOpenChange, stagingId, onSubmitted }: Props) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [staging, setStaging] = useState<StagingData | null>(null);
  const [acc, setAcc] = useState<AccInfo | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);

  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [roomTypeId, setRoomTypeId] = useState<string>("none");
  const [totalAmountOverride, setTotalAmountOverride] = useState("");

  useEffect(() => {
    if (!open || !stagingId) return;
    setLoading(true);
    setToken(null);
    setStaging(null);
    setGuestName(""); setGuestPhone(""); setGuestEmail("");
    setRoomTypeId("none"); setTotalAmountOverride("");
    (async () => {
      try {
        const { data: iss, error: issErr } = await supabase.functions.invoke("owlting-fillup-issue", {
          body: { staging_id: stagingId, silent: true },
        });
        if (issErr || !iss?.ok || !iss.token) throw new Error(iss?.error || issErr?.message || "無法產生補單 Token");
        setToken(iss.token);

        const { data: val, error: valErr } = await supabase.functions.invoke("owlting-fillup-validate", {
          body: { token: iss.token },
        });
        if (valErr || !val?.ok) throw new Error(val?.error || valErr?.message || "驗證失敗");
        setStaging(val.staging);
        setAcc(val.accommodation);
        setRoomTypes(val.room_types || []);
        if (val.staging?.total_amount) setTotalAmountOverride(String(val.staging.total_amount));
      } catch (e: any) {
        toast.error(`載入補單資料失敗：${e.message ?? e}`);
        onOpenChange(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, stagingId]);

  const copyObe = () => {
    if (!staging?.obe_number) return;
    navigator.clipboard.writeText(staging.obe_number);
    toast.success("已複製訂單編號");
  };

  const handleSubmit = async () => {
    if (!token) return;
    if (!guestName.trim() || !guestPhone.trim()) {
      toast.error("請填寫姓名與電話");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("owlting-fillup-submit", {
        body: {
          token,
          guest_name: guestName.trim(),
          guest_phone: guestPhone.trim(),
          guest_email: guestEmail.trim(),
          room_type_id: roomTypeId !== "none" ? roomTypeId : null,
          total_amount: totalAmountOverride ? Number(totalAmountOverride) : null,
        },
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "送出失敗");
      toast.success(`訂單已建立：${data.order_number}`);
      onSubmitted?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`送出失敗：${e.message ?? e}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {acc?.name ?? staging?.accommodation_name ?? "民宿"}：奧丁丁訂單補單
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : staging ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-3 space-y-2">
              <div className="text-xs text-muted-foreground">奧丁丁訂單編號</div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-xl font-bold font-mono">{staging.obe_number ?? "—"}</div>
                <Button size="sm" variant="outline" onClick={copyObe}>
                  <Copy className="h-3.5 w-3.5 mr-1" />複製
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={OWLNEST_ADMIN_URL} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />開 OwlNest
                  </a>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">入住：</span>{staging.check_in_date ?? "—"}</div>
              <div><span className="text-muted-foreground">退房：</span>{staging.check_out_date ?? "—"}</div>
              <div><span className="text-muted-foreground">人數：</span>{staging.guest_count ?? "—"}</div>
              <div><span className="text-muted-foreground">原房型：</span>{staging.room_type_name ?? "—"}</div>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="ad_guest_name">住客姓名 <span className="text-destructive">*</span></Label>
                <Input id="ad_guest_name" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="王小明" />
              </div>
              <div>
                <Label htmlFor="ad_guest_phone">電話 <span className="text-destructive">*</span></Label>
                <Input id="ad_guest_phone" type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="0912345678" />
              </div>
              <div>
                <Label htmlFor="ad_guest_email">Email</Label>
                <Input id="ad_guest_email" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="guest@example.com（可選）" />
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
                <Label htmlFor="ad_total_amount">訂單金額</Label>
                <Input id="ad_total_amount" type="number" value={totalAmountOverride}
                  onChange={(e) => setTotalAmountOverride(e.target.value)} placeholder="如不確定可留 0" />
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>取消</Button>
          <Button onClick={handleSubmit} disabled={submitting || loading || !staging}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            送出並建立訂單
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
