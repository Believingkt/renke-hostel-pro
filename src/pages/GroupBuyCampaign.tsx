import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
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
import { GroupBuyVenueIntro } from "@/components/groupbuy/GroupBuyVenueIntro";
import { GroupBuyDateField } from "@/components/groupbuy/GroupBuyDateField";
import { SALE_STATE_LABEL, saleState, validateStayRange } from "@/lib/groupBuyDateRules";
import { CalendarDays, CheckCircle2, Clock, Loader2, Users } from "lucide-react";

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
  room_type_ids: string[] | null;
  package_id: string | null;
  sort_order: number;
}

const fmtWindow = (iso?: string | null) =>
  iso && !isNaN(new Date(iso).getTime())
    ? new Intl.DateTimeFormat("zh-TW", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(iso))
    : "不限";

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
  const navigate = useNavigate();

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
  /** 前台日期限制（可入住起迄）＋ 販售狀態 */
  const stayErrors = useMemo(
    () => (campaign ? validateStayRange(campaign, checkIn, checkOut) : {}),
    [campaign, checkIn, checkOut],
  );
  const sale = campaign ? saleState(campaign) : "on_sale";
  const dateBlocked = !!(stayErrors.checkIn || stayErrors.checkOut);

  const checkAvailability = useCallback(async () => {
    const roomTypeIds =
      selectedPkg?.room_type_ids && selectedPkg.room_type_ids.length > 0
        ? selectedPkg.room_type_ids
        : selectedPkg?.room_type_id
          ? [selectedPkg.room_type_id]
          : [];
    if (!campaign || roomTypeIds.length === 0 || nights <= 0 || dateBlocked) {
      setAvailability({ checking: false, ok: null, message: "" });
      return;
    }
    setAvailability({ checking: true, ok: null, message: "" });
    const dates = dateList(checkIn, nights);
    let lastMessage = "此區間目前無足夠空房";

    for (const rtId of roomTypeIds) {
      const { data, error } = await supabase.rpc("get_adjusted_room_inventory_batch", {
        p_room_type_id: rtId,
        p_dates: dates,
        p_accommodation_id: campaign.accommodation_id,
      });
      if (error) continue;
      const rows = (data ?? []) as any[];
      const blocked = rows.find((r) => r?.is_blocked === true);
      if (blocked) {
        lastMessage = blocked.blocked_by_room_name
          ? `${blocked.date_value} 已被「${blocked.blocked_by_room_name}」預訂`
          : `${blocked.date_value} 已滿房`;
        continue;
      }
      const short = rows.find((r) => Number(r?.available_rooms ?? 0) < roomQuantity);
      if (short) {
        lastMessage = `${short.date_value} 僅剩 ${Math.max(0, Number(short.available_rooms))} 間`;
        continue;
      }
      setAvailability({ checking: false, ok: true, message: "此區間有空房，可立即預訂" });
      return;
    }
    setAvailability({ checking: false, ok: false, message: lastMessage });
  }, [campaign, selectedPkg, checkIn, nights, roomQuantity, dateBlocked]);

  useEffect(() => {
    void checkAvailability();
  }, [checkAvailability]);


  const submit = async () => {
    if (!campaign || !selectedPkg) return;
    if (sale !== "on_sale") {
      toast({ title: sale === "not_started" ? "團購尚未開賣" : "團購已結束", variant: "destructive" });
      return;
    }
    const errs = validateStayRange(campaign, checkIn, checkOut);
    const firstErr = errs.checkIn || errs.checkOut;
    if (firstErr) {
      toast({ title: "日期不符合活動規定", description: firstErr, variant: "destructive" });
      return;
    }
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
        // supabase.functions.invoke 在非 2xx 時只給「non-2xx status code」，
        // 真正的訊息在 error.context 的 response body，需要另外讀出來
        let message: string | null = payload?.error ?? null;
        const ctx: any = (error as any)?.context;
        if (!message && ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.clone().json();
            message = body?.error ?? null;
          } catch {
            /* ignore */
          }
        }
        toast({
          title: "預訂失敗",
          description: message ?? error?.message ?? "請稍後再試",
          variant: "destructive",
        });
        void checkAvailability();
        return;
      }
      setResult(payload);
      window.scrollTo({ top: 0, behavior: "smooth" });
      navigate(`/g/order/${payload.orderNumber}/confirmed`, {
        state: { phoneLast4: guestPhone.replace(/\D/g, "").slice(-4), result: payload },
      });
    } catch (e) {
      toast({ title: "預訂失敗", description: e instanceof Error ? e.message : "請稍後再試", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  if (!campaign) {
    return (
      <div className="gb-theme min-h-screen bg-background">
        <div className="mx-auto max-w-2xl px-5 py-24 text-center">
          <h1 className="text-xl font-semibold text-foreground">找不到這個團購活動</h1>
          <p className="mt-2 text-muted-foreground">活動可能尚未開始或已經結束。</p>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="gb-theme min-h-screen bg-background">
        <div className="mx-auto max-w-2xl px-5 py-10">
          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-5 w-5" /> 訂房已成立，請完成訂金匯款
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-2xl bg-muted p-4">
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
                  <span className="font-semibold text-accent">{twd(result.deposit)}</span>
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
                <div className="rounded-2xl bg-muted/60 p-4">
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
              <Button asChild className="h-12 w-full rounded-xl">
                <Link to={`/g/order/${result.orderNumber}`}>前往訂單查詢／回報匯款</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const saleBadge =
    sale === "on_sale" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-accent-foreground/80" />
        {SALE_STATE_LABEL.on_sale}
      </span>
    ) : (
      <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
        {SALE_STATE_LABEL[sale]}
      </span>
    );

  return (
    <div className="gb-theme min-h-screen bg-background pb-16 text-foreground">
      {/* ── Hero ── */}
      <header className="relative">
        {campaign.cover_image_url ? (
          <img
            src={campaign.cover_image_url}
            alt={campaign.title}
            className="h-[58vw] max-h-[520px] min-h-[240px] w-full object-cover sm:rounded-b-[2rem]"
          />
        ) : (
          <div className="h-24 w-full" />
        )}
        <div className="mx-auto max-w-3xl px-5">
          <div
            className={`relative z-10 rounded-2xl bg-card px-5 py-6 shadow-[0_10px_40px_-24px_rgba(63,57,51,0.55)] sm:px-8 sm:py-8 ${
              campaign.cover_image_url ? "-mt-10 sm:-mt-14" : "mt-6"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              {campaign.kol_display_name && (
                <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium tracking-wide text-secondary-foreground">
                  {campaign.kol_display_name} 專屬團購
                </span>
              )}
              {saleBadge}
            </div>
            <h1 className="mt-3 text-2xl font-bold leading-snug tracking-tight sm:text-[2rem]">{campaign.title}</h1>
            {campaign.subtitle && (
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{campaign.subtitle}</p>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5">
        {/* ── 活動資訊 ── */}
        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-muted/70 px-4 py-3.5">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> 販售期間
            </p>
            <p className="mt-1 text-sm tabular-nums">
              {fmtWindow(campaign.sale_start)} <span className="text-muted-foreground">~</span>{" "}
              {fmtWindow(campaign.sale_end)}
            </p>
          </div>
          <div className="rounded-2xl bg-muted/70 px-4 py-3.5">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" /> 可入住期間
            </p>
            <p className="mt-1 text-sm tabular-nums">
              {campaign.stay_start_date ?? "不限"} <span className="text-muted-foreground">~</span>{" "}
              {campaign.stay_end_date ?? "不限"}
            </p>
          </div>
        </section>
        {sale !== "on_sale" && (
          <p className="mt-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            此活動目前{SALE_STATE_LABEL[sale]}，暫時無法下訂。
          </p>
        )}

        {campaign.description_html && (
          <div
            className="prose prose-sm mt-7 max-w-none text-foreground prose-headings:text-foreground prose-p:leading-relaxed prose-strong:text-foreground"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(campaign.description_html) }}
          />
        )}

        {campaign.gallery_urls?.length > 0 && (
          <div className="mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {campaign.gallery_urls.map((url) => (
              <img
                key={url}
                src={url}
                alt={campaign.title}
                loading="lazy"
                className="aspect-[4/3] w-full rounded-xl object-cover"
              />
            ))}
          </div>
        )}

        {/* ── 方案 ── */}
        <section className="mt-10">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">選擇專屬方案</h2>
          <p className="mt-1 text-sm text-muted-foreground">團購限定價格，選定後於下方填寫資料即可完成預訂。</p>
          <div className="mt-4 space-y-3">
            {packages.map((p) => {
              const active = p.id === selectedPkgId;
              const save = p.original_price ? Math.round(p.original_price - p.group_buy_price) : 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPkgId(p.id)}
                  aria-pressed={active}
                  className={`flex w-full gap-3.5 rounded-2xl bg-card p-3.5 text-left transition sm:gap-4 sm:p-4 ${
                    active
                      ? "shadow-[0_0_0_2px_hsl(var(--primary)),0_14px_36px_-26px_rgba(63,57,51,0.7)]"
                      : "shadow-[0_1px_0_0_hsl(var(--border))] hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]"
                  }`}
                >
                  {p.image_url && (
                    <img
                      src={p.image_url}
                      alt={p.display_name}
                      loading="lazy"
                      className="h-24 w-24 shrink-0 rounded-xl object-cover sm:h-28 sm:w-32"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold leading-snug">{p.display_name}</p>
                      {active && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />}
                    </div>
                    {p.description && (
                      <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                        {p.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      {p.original_price ? (
                        <span className="text-xs text-muted-foreground/80 line-through">{twd(p.original_price)}</span>
                      ) : null}
                      <span className="text-xl font-bold tracking-tight text-accent sm:text-2xl">
                        {twd(p.group_buy_price)}
                      </span>
                      <span className="text-xs text-muted-foreground">／晚</span>
                      {save > 0 && (
                        <span className="rounded-full bg-accent/12 px-2 py-0.5 text-[11px] font-semibold text-accent">
                          省 {twd(save)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {packages.length === 0 && <p className="text-muted-foreground">此活動尚未上架方案。</p>}
          </div>
        </section>

        <GroupBuyVenueIntro
          accommodationId={campaign.accommodation_id}
          hideGallery={(campaign.gallery_urls?.length ?? 0) >= 3}
        />

        {/* ── 訂房表單（最終 CTA） ── */}
        <section className="mt-10 rounded-3xl bg-card p-5 shadow-[0_14px_50px_-34px_rgba(63,57,51,0.75)] sm:p-7">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">準備好入住了嗎？</h2>
          <p className="mt-1 text-sm text-muted-foreground">選擇日期並填寫資料，即可取得匯款資訊完成訂位。</p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4">
            <div>
              <Label htmlFor="gb-checkin" className="text-xs text-muted-foreground">入住日</Label>
              <GroupBuyDateField
                id="gb-checkin"
                value={checkIn}
                min={campaign.stay_start_date}
                max={campaign.stay_end_date}
                placeholder="選擇入住日"
                invalid={!!stayErrors.checkIn}
                onChange={setCheckIn}
              />
              {stayErrors.checkIn && <p className="mt-1 text-xs text-destructive">{stayErrors.checkIn}</p>}
            </div>
            <div>
              <Label htmlFor="gb-checkout" className="text-xs text-muted-foreground">退房日</Label>
              <GroupBuyDateField
                id="gb-checkout"
                value={checkOut}
                min={checkIn || campaign.stay_start_date}
                max={campaign.stay_end_date}
                placeholder="選擇退房日"
                invalid={!!stayErrors.checkOut}
                onChange={setCheckOut}
              />
              {stayErrors.checkOut && <p className="mt-1 text-xs text-destructive">{stayErrors.checkOut}</p>}
            </div>

            <div>
              <Label htmlFor="gb-rooms" className="text-xs text-muted-foreground">間數</Label>
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
              <Label htmlFor="gb-guests" className="text-xs text-muted-foreground">入住人數</Label>
              <Input
                id="gb-guests"
                type="number"
                min={1}
                value={guestCount}
                onChange={(e) => setGuestCount(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="col-span-2">
              <Label htmlFor="gb-name" className="text-xs text-muted-foreground">訂房人姓名</Label>
              <Input id="gb-name" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label htmlFor="gb-phone" className="text-xs text-muted-foreground">聯絡電話</Label>
              <Input id="gb-phone" inputMode="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label htmlFor="gb-email" className="text-xs text-muted-foreground">Email（接收訂單確認及匯款資訊）</Label>
              <Input id="gb-email" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="gb-note" className="text-xs text-muted-foreground">
                備註（民宿將盡力配合，但無法保證能滿足所有需求）
              </Label>
              <Textarea id="gb-note" rows={3} value={guestNote} onChange={(e) => setGuestNote(e.target.value)} />
            </div>
          </div>

          {nights > 0 && (
            <div className="mt-5 rounded-2xl bg-muted/70 p-4 text-sm">
              <div className="flex items-center justify-between py-1">
                <span className="text-muted-foreground">
                  <Users className="mr-1 inline h-4 w-4" />
                  {nights} 晚 × {roomQuantity} 間
                </span>
                <span className="tabular-nums">{twd(total)}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-muted-foreground">應付訂金（{depositPct}%）</span>
                <span className="text-base font-bold tabular-nums text-accent">{twd(deposit)}</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-muted-foreground">入住現場付清</span>
                <span className="tabular-nums">{twd(balance)}</span>
              </div>
              {availability.ok === false && <p className="mt-2 text-destructive">{availability.message}</p>}
              {availability.ok === true && <p className="mt-2 text-primary">{availability.message}</p>}
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                訂單成立後 {campaign.payment_deadline_hours} 小時內未完成訂金匯款，系統將自動取消。
              </p>
            </div>
          )}

          <Button
            className="mt-5 h-14 w-full rounded-xl bg-accent text-base font-semibold text-accent-foreground hover:bg-accent/90"
            disabled={
              submitting ||
              availability.checking ||
              availability.ok === false ||
              nights <= 0 ||
              !selectedPkg ||
              dateBlocked ||
              sale !== "on_sale"
            }
            onClick={submit}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            確認訂房並取得匯款資訊
          </Button>

          <p className="mt-3 text-center text-sm text-muted-foreground">
            已下訂？
            <Link to="/g/order" className="font-medium text-primary underline underline-offset-4">
              查詢訂單／回報匯款
            </Link>
          </p>
        </section>

        {campaign.terms_html && (
          <div
            className="prose prose-sm mt-6 max-w-none text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(campaign.terms_html) }}
          />
        )}

        {campaign.contact_note && (
          <p className="mt-4 text-center text-sm text-muted-foreground">{campaign.contact_note}</p>
        )}
      </main>
    </div>
  );
}

