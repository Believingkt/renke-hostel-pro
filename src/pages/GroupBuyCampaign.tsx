import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { sanitizeHtml } from "@/utils/sanitizeHtml";
import { CampaignWindowSummary } from "@/components/admin/CampaignWindowSummary";
import { SALE_STATE_LABEL, saleState, validateStayRange } from "@/lib/groupBuyDateRules";
import { CalendarDays, CheckCircle2, Loader2, Users } from "lucide-react";

interface Campaign {
  id: string;
  accommodation_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description_html: string | null;
  cover_image_url: string | null;
  gallery_urls: string[];
  kol_display_name: string | null;
  sale_start: string | null;
  sale_end: string | null;
  stay_start_date: string | null;
  stay_end_date: string | null;
  deposit_percentage: number;
  payment_deadline_hours: number;
  contact_note: string | null;
  terms_html: string | null;
}

interface CampaignPackage {
  id: string;
  display_name: string;
  description: string | null;
  image_url: string | null;
  group_buy_price: number;
  original_price: number | null;
  max_quantity: number | null;
  room_type_id: string | null;
  package_id: string | null;
  sort_order: number;
}

const twd = (n: number) => `NT$ ${Math.round(n || 0).toLocaleString("en-US")}`;

function nightsBetween(a: string, b: string) {
  if (!a || !b) return 0;
  const diff = (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000;
  return diff > 0 ? Math.round(diff) : 0;
}

function dateList(checkIn: string, n: number) {
  const [y, m, d] = checkIn.split("-").map(Number);
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + i)).toISOString().split("T")[0],
  );
}

export default function GroupBuyCampaign() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [packages, setPackages] = useState<CampaignPackage[]>([]);
  const [selectedPkgId, setSelectedPkgId] = useState<string>("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [roomQuantity, setRoomQuantity] = useState(1);
  const [guestCount, setGuestCount] = useState(2);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestNote, setGuestNote] = useState("");
  const [availability, setAvailability] = useState<{ checking: boolean; ok: boolean | null; message: string }>({
    checking: false,
    ok: null,
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug) return;
      setLoading(true);
      const { data: c } = await supabase
        .from("group_buy_campaigns")
        .select("*")
        .eq("slug", slug)
        .eq("status", "active")
        .maybeSingle();
      if (cancelled) return;
      if (!c) {
        setCampaign(null);
        setLoading(false);
        return;
      }
      setCampaign(c as unknown as Campaign);
      const { data: pkgs } = await supabase
        .from("group_buy_campaign_packages")
        .select("*")
        .eq("campaign_id", c.id)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      const list = (pkgs ?? []) as unknown as CampaignPackage[];
      setPackages(list);
      if (list.length > 0) setSelectedPkgId(list[0].id);
      if (c.stay_start_date) setCheckIn(c.stay_start_date);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const selectedPkg = useMemo(
    () => packages.find((p) => p.id === selectedPkgId) ?? null,
    [packages, selectedPkgId],
  );
  const nights = nightsBetween(checkIn, checkOut);
  const total = selectedPkg ? Math.round(selectedPkg.group_buy_price) * nights * roomQuantity : 0;
  const depositPct = campaign?.deposit_percentage ?? 30;
  const deposit = Math.min(total, Math.round((total * depositPct) / 100));
  const balance = Math.max(0, total - deposit);

  const checkAvailability = useCallback(async () => {
    if (!campaign || !selectedPkg?.room_type_id || nights <= 0) {
      setAvailability({ checking: false, ok: null, message: "" });
      return;
    }
    setAvailability({ checking: true, ok: null, message: "" });
    const { data, error } = await supabase.rpc("get_adjusted_room_inventory_batch", {
      p_room_type_id: selectedPkg.room_type_id,
      p_dates: dateList(checkIn, nights),
      p_accommodation_id: campaign.accommodation_id,
    });
    if (error) {
      setAvailability({ checking: false, ok: null, message: "" });
      return;
    }
    const rows = (data ?? []) as any[];
    const blocked = rows.find((r) => r?.is_blocked === true);
    if (blocked) {
      setAvailability({
        checking: false,
        ok: false,
        message: blocked.blocked_by_room_name
          ? `${blocked.date_value} 已被「${blocked.blocked_by_room_name}」預訂`
          : `${blocked.date_value} 已滿房`,
      });
      return;
    }
    const short = rows.find((r) => Number(r?.available_rooms ?? 0) < roomQuantity);
    if (short) {
      setAvailability({
        checking: false,
        ok: false,
        message: `${short.date_value} 僅剩 ${Math.max(0, Number(short.available_rooms))} 間`,
      });
      return;
    }
    setAvailability({ checking: false, ok: true, message: "此區間有空房，可立即預訂" });
  }, [campaign, selectedPkg, checkIn, nights, roomQuantity]);

  useEffect(() => {
    void checkAvailability();
  }, [checkAvailability]);

  const submit = async () => {
    if (!campaign || !selectedPkg) return;
    if (nights <= 0) {
      toast({ title: "請選擇入住與退房日期", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("group-buy-create-order", {
        body: {
          slug: campaign.slug,
          campaignPackageId: selectedPkg.id,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          roomQuantity,
          guestCount,
          guestName,
          guestPhone,
          guestEmail,
          guestNote,
          origin: window.location.origin,
        },
      });
      const payload: any = data;
      if (error || payload?.error) {
        toast({
          title: "預訂失敗",
          description: payload?.error ?? error?.message ?? "請稍後再試",
          variant: "destructive",
        });
        void checkAvailability();
        return;
      }
      setResult(payload);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast({ title: "預訂失敗", description: e instanceof Error ? e.message : "請稍後再試", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  if (!campaign) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="text-xl font-semibold text-foreground">找不到這個團購活動</h1>
        <p className="mt-2 text-muted-foreground">活動可能尚未開始或已經結束。</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-5 w-5" /> 訂房已成立，請完成訂金匯款
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-lg bg-muted p-4">
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">訂單編號</span>
                <span className="font-semibold">{result.orderNumber}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">訂單總額</span>
                <span>{twd(result.total)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">應付訂金（{result.depositPercentage}%）</span>
                <span className="font-semibold text-primary">{twd(result.deposit)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">入住現場付清</span>
                <span>{twd(result.balance)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">匯款期限</span>
                <span className="font-semibold">{result.paymentDeadlineText}</span>
              </div>
            </div>

            {result.bank ? (
              <div className="rounded-lg border p-4">
                <p className="mb-2 font-semibold text-foreground">匯款資訊</p>
                <p>
                  {result.bank.bankName}
                  {result.bank.bankCode ? `（${result.bank.bankCode}）` : ""}
                  {result.bank.branchName ? ` ${result.bank.branchName}` : ""}
                </p>
                <p>戶名：{result.bank.accountName}</p>
                <p className="font-semibold">帳號：{result.bank.accountNumber}</p>
                {result.bank.note && <p className="text-muted-foreground">{result.bank.note}</p>}
              </div>
            ) : (
              <p className="text-muted-foreground">匯款資訊將由客服另行提供，請留意信箱通知。</p>
            )}

            <p className="text-muted-foreground">
              匯款完成後，請至訂單查詢頁點選「我已完成匯款」，逾期未匯款訂單將自動取消。
              {result.emailSent ? " 通知信已寄至您的信箱。" : ""}
            </p>
            <Button asChild className="w-full">
              <Link to={`/g/order/${result.orderNumber}`}>前往訂單查詢／回報匯款</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-24">
      {campaign.cover_image_url && (
        <img
          src={campaign.cover_image_url}
          alt={campaign.title}
          className="mb-5 aspect-[16/9] w-full rounded-xl object-cover"
        />
      )}
      <div className="space-y-2">
        {campaign.kol_display_name && <Badge variant="secondary">{campaign.kol_display_name} 專屬團購</Badge>}
        <h1 className="text-2xl font-bold text-foreground">{campaign.title}</h1>
        {campaign.subtitle && <p className="text-muted-foreground">{campaign.subtitle}</p>}
        {(campaign.stay_start_date || campaign.stay_end_date) && (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            可入住期間：{campaign.stay_start_date ?? "不限"} ~ {campaign.stay_end_date ?? "不限"}
          </p>
        )}
      </div>

      {campaign.description_html && (
        <div
          className="prose prose-sm mt-5 max-w-none text-foreground"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(campaign.description_html) }}
        />
      )}

      {campaign.gallery_urls?.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {campaign.gallery_urls.map((url) => (
            <img key={url} src={url} alt={campaign.title} loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
          ))}
        </div>
      )}

      <Separator className="my-6" />

      <h2 className="mb-3 text-lg font-semibold text-foreground">選擇專屬方案</h2>
      <div className="space-y-3">
        {packages.map((p) => {
          const active = p.id === selectedPkgId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPkgId(p.id)}
              className={`flex w-full gap-3 rounded-xl border p-3 text-left transition ${
                active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              }`}
            >
              {p.image_url && (
                <img src={p.image_url} alt={p.display_name} loading="lazy" className="h-20 w-20 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">{p.display_name}</p>
                {p.description && <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                <p className="mt-1 text-sm">
                  <span className="font-semibold text-primary">{twd(p.group_buy_price)}</span>
                  <span className="text-muted-foreground"> / 晚</span>
                  {p.original_price ? (
                    <span className="ml-2 text-muted-foreground line-through">{twd(p.original_price)}</span>
                  ) : null}
                </p>
              </div>
            </button>
          );
        })}
        {packages.length === 0 && <p className="text-muted-foreground">此活動尚未上架方案。</p>}
      </div>

      <Separator className="my-6" />

      <h2 className="mb-3 text-lg font-semibold text-foreground">填寫訂房資料</h2>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="gb-checkin">入住日</Label>
          <Input
            id="gb-checkin"
            type="date"
            value={checkIn}
            min={campaign.stay_start_date ?? undefined}
            max={campaign.stay_end_date ?? undefined}
            onChange={(e) => setCheckIn(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="gb-checkout">退房日</Label>
          <Input
            id="gb-checkout"
            type="date"
            value={checkOut}
            min={checkIn || campaign.stay_start_date || undefined}
            max={campaign.stay_end_date ?? undefined}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="gb-rooms">間數</Label>
          <Input
            id="gb-rooms"
            type="number"
            min={1}
            max={selectedPkg?.max_quantity ?? 10}
            value={roomQuantity}
            onChange={(e) => setRoomQuantity(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
        <div>
          <Label htmlFor="gb-guests">入住人數</Label>
          <Input
            id="gb-guests"
            type="number"
            min={1}
            value={guestCount}
            onChange={(e) => setGuestCount(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="gb-name">訂房人姓名</Label>
          <Input id="gb-name" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label htmlFor="gb-phone">聯絡電話</Label>
          <Input id="gb-phone" inputMode="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label htmlFor="gb-email">Email（接收匯款資訊）</Label>
          <Input id="gb-email" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label htmlFor="gb-note">備註</Label>
          <Textarea id="gb-note" rows={3} value={guestNote} onChange={(e) => setGuestNote(e.target.value)} />
        </div>
      </div>

      {nights > 0 && (
        <div className="mt-4 rounded-xl border p-4 text-sm">
          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">
              <Users className="mr-1 inline h-4 w-4" />
              {nights} 晚 × {roomQuantity} 間
            </span>
            <span>{twd(total)}</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">應付訂金（{depositPct}%）</span>
            <span className="font-semibold text-primary">{twd(deposit)}</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-muted-foreground">入住現場付清</span>
            <span>{twd(balance)}</span>
          </div>
          {availability.ok === false && <p className="mt-2 text-destructive">{availability.message}</p>}
          {availability.ok === true && <p className="mt-2 text-primary">{availability.message}</p>}
          <p className="mt-2 text-muted-foreground">
            訂單成立後 {campaign.payment_deadline_hours} 小時內未完成訂金匯款，系統將自動取消。
          </p>
        </div>
      )}

      {campaign.terms_html && (
        <div
          className="prose prose-sm mt-5 max-w-none text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(campaign.terms_html) }}
        />
      )}

      <Button
        className="mt-5 w-full"
        size="lg"
        disabled={submitting || availability.checking || availability.ok === false || nights <= 0 || !selectedPkg}
        onClick={submit}
      >
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        確認訂房並取得匯款資訊
      </Button>

      <p className="mt-3 text-center text-sm text-muted-foreground">
        已下訂？<Link to="/g/order" className="text-primary underline">查詢訂單／回報匯款</Link>
      </p>
      {campaign.contact_note && <p className="mt-2 text-center text-sm text-muted-foreground">{campaign.contact_note}</p>}
    </div>
  );
}
