import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { isAmountSuspicious, isGuestCountValid } from "@/lib/owltingFillupValidation";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stagingId: string | null;
  onSubmitted?: () => void;
}

interface StagingRow {
  id: string;
  obe_number: string | null;
  accommodation_id: string | null;
  accommodation_name: string | null;
  room_type_name: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  guest_count: number | null;
  total_amount: number | null;
  pii_status: string;
}
interface AccOption { id: string; name: string; aliases: string[]; }
interface RoomType { id: string; name: string; base_price: number; }

const OWLNEST_ADMIN_URL = "https://www.owlting.com/booking/admin/?l=zh_TW&p=order";

export function OwlTingFillupDialog({ open, onOpenChange, stagingId, onSubmitted }: Props) {
  const [phase, setPhase] = useState<"loading" | "pick_acc" | "form" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [preparing, setPreparing] = useState(false);

  const [stagingRow, setStagingRow] = useState<StagingRow | null>(null);
  const [accOptions, setAccOptions] = useState<AccOption[]>([]);
  const [selectedAccId, setSelectedAccId] = useState<string>("none");

  const [token, setToken] = useState<string | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [accName, setAccName] = useState<string>("");

  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [roomTypeId, setRoomTypeId] = useState<string>("none");
  const [totalAmountOverride, setTotalAmountOverride] = useState("");
  const [guestCount, setGuestCount] = useState<string>("2");

  const reset = () => {
    setPhase("loading"); setErrorMsg(null); setStagingRow(null); setAccOptions([]);
    setSelectedAccId("none"); setToken(null); setRoomTypes([]); setAccName("");
    setGuestName(""); setGuestPhone(""); setGuestEmail("");
    setRoomTypeId("none"); setTotalAmountOverride(""); setGuestCount("2");
  };

  const [matchReason, setMatchReason] = useState<string | null>(null);
  const [matchFailedReason, setMatchFailedReason] = useState<string | null>(null);

  // Step 1: load staging row and decide path
  useEffect(() => {
    if (!open || !stagingId) return;
    reset();
    setMatchReason(null);
    setMatchFailedReason(null);
    (async () => {
      const { data, error } = await supabase
        .from("owlting_email_parsed_staging")
        .select("id, raw_email_id, obe_number, accommodation_id, accommodation_name, room_type_name, check_in_date, check_out_date, guest_count, total_amount, pii_status")
        .eq("id", stagingId)
        .maybeSingle();
      if (error || !data) {
        setErrorMsg(error?.message ?? "找不到此筆 staging");
        setPhase("error");
        return;
      }
      const row = data as StagingRow & { raw_email_id: string | null };
      setStagingRow(row);
      if (row.total_amount) setTotalAmountOverride(String(row.total_amount));
      if (row.guest_count && row.guest_count > 0) setGuestCount(String(row.guest_count));

      if (row.accommodation_id) {
        prepareToken(row.accommodation_id);
        return;
      }

      // Need auto-match
      const { data: accs } = await supabase
        .from("accommodation_info")
        .select("id, name, owlting_aliases")
        .order("name");
      const options: AccOption[] = (accs ?? []).map((a: any) => ({
        id: a.id,
        name: a.name ?? "(未命名)",
        aliases: Array.isArray(a.owlting_aliases) ? (a.owlting_aliases as string[]) : [],
      }));
      setAccOptions(options);

      // Strategy 1: match by accommodation_name across name + aliases (normalized exact then contains)
      const rawName = (row.accommodation_name ?? "").trim();
      if (rawName) {
        const norm = (s: string) =>
          s
            .toLowerCase()
            .replace(/\s+/g, "")
            .replace(/　/g, "")
            .replace(/（/g, "(")
            .replace(/）/g, ")")
            .replace(/渡假/g, "度假");
        const target = norm(rawName);
        const candidatesFor = (o: AccOption) => [o.name, ...o.aliases].map(norm).filter(Boolean);
        const exact = options.find((o) => candidatesFor(o).some((c) => c === target));
        const contains =
          exact ||
          options.find((o) => candidatesFor(o).some((c) => c.includes(target) || target.includes(c)));
        if (contains) {
          setSelectedAccId(contains.id);
          setMatchReason(`依信件中民宿名「${rawName}」自動匹配到「${contains.name}」`);
          setPhase("pick_acc");
          return;
        }
      }


      // Strategy 2: match by owner email from raw_email.from_email
      if (row.raw_email_id) {
        const { data: raw } = await supabase
          .from("owlting_email_orders_raw")
          .select("from_email")
          .eq("id", row.raw_email_id)
          .maybeSingle();
        const fromEmail = (raw?.from_email ?? "").trim().toLowerCase();
        if (fromEmail) {
          const { data: owner } = await supabase
            .from("accommodation_owners")
            .select("accommodation_id")
            .eq("email", fromEmail)
            .eq("is_active", true)
            .maybeSingle();
          if (owner?.accommodation_id) {
            const opt = options.find((o) => o.id === owner.accommodation_id);
            if (opt) {
              setSelectedAccId(opt.id);
              setMatchReason(`依寄件業主信箱「${fromEmail}」自動匹配到「${opt.name}」`);
              setPhase("pick_acc");
              return;
            }
          }
        }
      }

      // No match — show full picker with reason
      setMatchFailedReason(
        rawName
          ? `信件中民宿名「${rawName}」未對應到任何已建立的民宿；寄件業主信箱也找不到對應。請手動指定。`
          : "信件未含可辨識的民宿名稱、寄件業主信箱也找不到對應。請手動指定。"
      );
      setPhase("pick_acc");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stagingId]);

  const prepareToken = async (accId: string) => {
    setPreparing(true);
    try {
      const { data: iss, error: issErr } = await supabase.functions.invoke("owlting-fillup-issue", {
        body: { staging_id: stagingId, accommodation_id: accId, silent: true },
      });
      if (issErr || !iss?.ok || !iss.token) {
        throw new Error(iss?.error || issErr?.message || "無法產生補單 Token");
      }
      setToken(iss.token);

      const { data: val, error: valErr } = await supabase.functions.invoke("owlting-fillup-validate", {
        body: { token: iss.token },
      });
      if (valErr || !val?.ok) throw new Error(val?.error || valErr?.message || "驗證失敗");
      setRoomTypes(val.room_types || []);
      setAccName(val.accommodation?.name ?? stagingRow?.accommodation_name ?? "");
      setPhase("form");
    } catch (e: any) {
      setErrorMsg(e.message ?? String(e));
      setPhase("error");
    } finally {
      setPreparing(false);
    }
  };

  const copyObe = () => {
    if (!stagingRow?.obe_number) return;
    navigator.clipboard.writeText(stagingRow.obe_number);
    toast.success("已複製訂單編號");
  };

  const amountNum = totalAmountOverride ? Number(totalAmountOverride) : NaN;
  const amountSuspicious = isAmountSuspicious(totalAmountOverride);
  const guestCountNum = Number(guestCount);
  const guestCountValid = isGuestCountValid(guestCount);
  const formReady =
    !!guestName.trim() &&
    !!guestPhone.trim() &&
    roomTypeId !== "none" &&
    guestCountValid;

  const handleSubmit = async () => {
    if (!token) return;
    if (!guestName.trim() || !guestPhone.trim()) {
      toast.error("請填寫姓名與電話");
      return;
    }
    if (roomTypeId === "none") {
      toast.error("請選擇對應房型");
      return;
    }
    if (!guestCountValid) {
      toast.error("人數需為 1-50 之間的整數");
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
          room_type_id: roomTypeId,
          guest_count: guestCountNum,
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
            {accName || stagingRow?.accommodation_name || "民宿"}：奧丁丁訂單補單
          </DialogTitle>
        </DialogHeader>

        {phase === "loading" && (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {phase === "error" && (
          <div className="py-6 space-y-3 text-sm">
            <p className="text-destructive">{errorMsg}</p>
            <p className="text-muted-foreground text-xs">請關閉重試，或先回到收件監控頁確認資料。</p>
          </div>
        )}

        {phase === "pick_acc" && stagingRow && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
              <div><span className="text-muted-foreground">訂單編號：</span><span className="font-mono font-bold">{stagingRow.obe_number ?? "—"}</span></div>
              <div><span className="text-muted-foreground">入住：</span>{stagingRow.check_in_date ?? "—"} → {stagingRow.check_out_date ?? "—"}</div>
              {stagingRow.accommodation_name && (
                <div><span className="text-muted-foreground">信件民宿名：</span>{stagingRow.accommodation_name}</div>
              )}
            </div>

            {matchReason && (
              <div className="rounded-md border border-green-200 bg-green-50 text-green-800 px-3 py-2 text-xs">
                ✓ {matchReason}（可下方修改）
              </div>
            )}
            {matchFailedReason && (
              <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-xs">
                ⚠ 自動匹配失敗：{matchFailedReason}
              </div>
            )}

            <div>
              <Label>對應民宿 <span className="text-destructive">*</span></Label>
              <Select value={selectedAccId} onValueChange={setSelectedAccId}>
                <SelectTrigger><SelectValue placeholder="請選擇民宿" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">請選擇</SelectItem>
                  {accOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {phase === "form" && stagingRow && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-3 space-y-2">
              <div className="text-xs text-muted-foreground">奧丁丁訂單編號</div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-xl font-bold font-mono">{stagingRow.obe_number ?? "—"}</div>
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
              <div><span className="text-muted-foreground">入住：</span>{stagingRow.check_in_date ?? "—"}</div>
              <div><span className="text-muted-foreground">退房：</span>{stagingRow.check_out_date ?? "—"}</div>
              <div><span className="text-muted-foreground">人數：</span>{stagingRow.guest_count ?? "—"}</div>
              <div><span className="text-muted-foreground">原房型：</span>{stagingRow.room_type_name ?? "—"}</div>
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
                <Label>對應房型 <span className="text-destructive">*</span></Label>
                <Select value={roomTypeId} onValueChange={setRoomTypeId}>
                  <SelectTrigger><SelectValue placeholder="請選擇房型" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">請選擇</SelectItem>
                    {roomTypes.map((rt) => (
                      <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {stagingRow.room_type_name && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    信件原房型欄位：「{stagingRow.room_type_name}」（僅供參考，請依 OwlNest 後台實際房型選擇）
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="ad_guest_count">住客人數 <span className="text-destructive">*</span></Label>
                <Input
                  id="ad_guest_count"
                  type="number"
                  min={1}
                  max={50}
                  value={guestCount}
                  onChange={(e) => setGuestCount(e.target.value)}
                />
                {!guestCountValid && (
                  <p className="text-[11px] text-destructive mt-1">人數需為 1-50 之間的整數</p>
                )}
              </div>
              <div>
                <Label htmlFor="ad_total_amount">訂單金額</Label>
                <Input id="ad_total_amount" type="number" value={totalAmountOverride}
                  onChange={(e) => setTotalAmountOverride(e.target.value)} placeholder="如不確定可留 0" />
                {amountSuspicious && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                    ⚠ 金額看起來不太對（{amountNum}），請從 OwlNest 後台確認後修正
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting || preparing}>取消</Button>
          {phase === "pick_acc" && (
            <Button
              onClick={() => selectedAccId !== "none" && prepareToken(selectedAccId)}
              disabled={selectedAccId === "none" || preparing}
            >
              {preparing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              繼續
            </Button>
          )}
          {phase === "form" && (
            <Button onClick={handleSubmit} disabled={submitting || !formReady}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              送出並建立訂單
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
