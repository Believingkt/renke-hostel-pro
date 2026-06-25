import { useEffect, useState, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TeamOption {
  user_id: string;
  display_name: string;
}

interface CommonAd {
  id: string;
  label: string;
  ad_id: string;
}

interface OptionRow {
  id: string;
  name: string;
  sort_order: number | null;
}

interface FranchiseProject {
  id: string;
  name: string;
}

interface Props {
  orderId: string | null;
  open: boolean;
  onClose: () => void;
}

const NONE = "none";

export function OrderMetaDrawer({ orderId, open, onClose }: Props) {
  const [closers, setClosers] = useState<TeamOption[]>([]);
  const [videoCreators, setVideoCreators] = useState<TeamOption[]>([]);
  const [commonAds, setCommonAds] = useState<CommonAd[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [trafficSources, setTrafficSources] = useState<OptionRow[]>([]);
  const [bookingMethods, setBookingMethods] = useState<OptionRow[]>([]);
  const [franchiseProjects, setFranchiseProjects] = useState<FranchiseProject[]>([]);
  const [adVideoRules, setAdVideoRules] = useState<
    { keyword: string; video_creator_id: string; sort_order: number | null }[]
  >([]);
  const [adNameByAdId, setAdNameByAdId] = useState<Record<string, string>>({});


  const [closerId, setCloserId] = useState<string>(NONE);
  const [videoCreatorId, setVideoCreatorId] = useState<string>(NONE);
  const [trafficSource, setTrafficSource] = useState<string>(NONE);
  const [bookingMethod, setBookingMethod] = useState<string>(NONE);
  const [adId, setAdId] = useState("");
  const [franchiseProject, setFranchiseProject] = useState<string>(NONE);
  const [memberNumber, setMemberNumber] = useState("");
  const [isExcluded, setIsExcluded] = useState(false);
  const [exclusionNote, setExclusionNote] = useState("");
  const [inquiryDate, setInquiryDate] = useState<string>("");
  const [voucherCount, setVoucherCount] = useState<number>(0);
  const [addonNote, setAddonNote] = useState("");
  const [addonAmount, setAddonAmount] = useState<number>(0);
  const [nickname, setNickname] = useState("");
  const [depositConfirmDate, setDepositConfirmDate] = useState<string>("");
  const [orderDate, setOrderDate] = useState<string | null>(null);
  const [finalPrice, setFinalPrice] = useState<number | null>(null);
  const [teamCommissionPrice, setTeamCommissionPrice] = useState<number | null>(null);
  const [initialTeamCommissionPrice, setInitialTeamCommissionPrice] = useState<number | null>(null);
  const [commissionConfirmedBy, setCommissionConfirmedBy] = useState<string | null>(null);
  const [commissionConfirmedAt, setCommissionConfirmedAt] = useState<string | null>(null);
  const [commissionConfirmerName, setCommissionConfirmerName] = useState<string | null>(null);
  const [canEditCommissionPrice, setCanEditCommissionPrice] = useState(false);
  const [saving, setSaving] = useState(false);

  // Inline add option inputs
  const [newTrafficSource, setNewTrafficSource] = useState("");
  const [newBookingMethod, setNewBookingMethod] = useState("");
  const [addingTraffic, setAddingTraffic] = useState(false);
  const [addingBooking, setAddingBooking] = useState(false);

  // Reset form whenever a new order opens the drawer
  useEffect(() => {
    if (open && orderId) {
      setCloserId(NONE);
      setVideoCreatorId(NONE);
      setTrafficSource(NONE);
      setBookingMethod(NONE);
      setAdId("");
      setFranchiseProject(NONE);
      setMemberNumber("");
      setIsExcluded(false);
      setExclusionNote("");
      setInquiryDate("");
      setVoucherCount(0);
      setAddonNote("");
      setAddonAmount(0);
      setNickname("");
      setDepositConfirmDate("");
      setOrderDate(null);
      setFinalPrice(null);
      setTeamCommissionPrice(null);
      setInitialTeamCommissionPrice(null);
      setCommissionConfirmedBy(null);
      setCommissionConfirmedAt(null);
      setCommissionConfirmerName(null);
      setNewTrafficSource("");
      setNewBookingMethod("");
    }
  }, [open, orderId]);


  // Load team options + common ads + current user + dynamic options + existing meta
  useEffect(() => {
    if (!open || !orderId) return;
    let cancelled = false;

    (async () => {
      const [
        { data: sessionRes },
        { data: closerRoles },
        { data: videoRoles },
        { data: ads },
        { data: tsRows },
        { data: bmRows },
        { data: fpRows },
        { data: ruleRows },
        { data: metaAdsRows },
        { data: existingMeta },
        { data: orderRow },

      ] = await Promise.all([
        supabase.auth.getSession(),
        supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "closer")
          .is("accommodation_id", null),
        supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "video")
          .is("accommodation_id", null),
        supabase
          .from("common_ad_ids")
          .select("id, label, ad_id")
          .order("sort_order", { ascending: true }),
        supabase
          .from("traffic_sources")
          .select("id, name, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("booking_methods")
          .select("id, name, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("franchise_projects")
          .select("id, name")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("ad_video_creator_rules")
          .select("keyword, video_creator_id, sort_order")
          .order("sort_order", { ascending: true }),
        supabase
          .from("meta_ads")
          .select("ad_id, ad_name"),
        supabase
          .from("order_meta")
          .select("*")
          .eq("order_id", orderId)
          .maybeSingle(),
        supabase
          .from("orders")
          .select("order_date, final_price")
          .eq("id", orderId)
          .maybeSingle(),
      ]) as any;


      const closerIds = (closerRoles ?? []).map((r) => r.user_id);
      const videoIds = (videoRoles ?? []).map((r) => r.user_id);
      const allIds = Array.from(new Set([...closerIds, ...videoIds]));

      let profileMap = new Map<string, string>();
      if (allIds.length > 0) {
        const { data: profiles } = await supabase
          .from("team_member_profiles")
          .select("user_id, display_name")
          .in("user_id", allIds);
        profileMap = new Map(
          (profiles ?? []).map((p) => [p.user_id, p.display_name]),
        );
      }

      const toOptions = (ids: string[]): TeamOption[] =>
        ids
          .filter((id) => profileMap.has(id))
          .map((id) => ({ user_id: id, display_name: profileMap.get(id)! }))
          .sort((a, b) => a.display_name.localeCompare(b.display_name, "zh-TW"));

      if (cancelled) return;

      const uid = sessionRes.session?.user.id ?? null;
      setCurrentUserId(uid);
      setClosers(toOptions(closerIds));
      setVideoCreators(toOptions(videoIds));
      setCommonAds(ads ?? []);
      setTrafficSources((tsRows ?? []) as OptionRow[]);
      setBookingMethods((bmRows ?? []) as OptionRow[]);
      setFranchiseProjects((fpRows ?? []) as FranchiseProject[]);
      setAdVideoRules(
        ((ruleRows ?? []) as any[]).filter(
          (r) => r.keyword && r.video_creator_id,
        ),
      );
      const nameMap: Record<string, string> = {};
      for (const a of (metaAdsRows ?? []) as Array<{ ad_id: string; ad_name: string | null }>) {
        if (a.ad_id && a.ad_name) nameMap[a.ad_id] = a.ad_name;
      }
      setAdNameByAdId(nameMap);


      const orderRowTyped =
        (orderRow as { order_date?: string | null; final_price?: number | null } | null);
      setOrderDate(orderRowTyped?.order_date ?? null);
      const fp = orderRowTyped?.final_price ?? null;
      setFinalPrice(fp);

      // Determine if current user can edit 分潤基準金額 (closer / hotel_admin / super_admin)
      if (uid) {
        const { data: roleRows } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", uid);
        const roles = ((roleRows ?? []) as Array<{ role: string }>).map((r) => r.role);
        setCanEditCommissionPrice(
          roles.includes("closer") ||
            roles.includes("hotel_admin") ||
            roles.includes("super_admin"),
        );
      } else {
        setCanEditCommissionPrice(false);
      }

      if (existingMeta) {
        const m = existingMeta as Record<string, unknown>;
        setCloserId((m.closer_id as string) ?? NONE);
        setVideoCreatorId((m.video_creator_id as string) ?? NONE);
        setTrafficSource((m.traffic_source as string) ?? NONE);
        setBookingMethod((m.booking_method as string) ?? NONE);
        setAdId((m.ad_id as string) ?? "");
        setFranchiseProject((m.franchise_project as string) ?? NONE);
        setMemberNumber((m.member_number as string) ?? "");
        setIsExcluded(Boolean(m.is_excluded));
        setExclusionNote((m.exclusion_note as string) ?? "");
        setInquiryDate((m.inquiry_date as string) ?? "");
        setVoucherCount(Number(m.voucher_count ?? 0));
        setAddonNote((m.addon_note as string) ?? "");
        setAddonAmount(Number(m.addon_amount ?? 0));
        setNickname((m.nickname as string) ?? "");
        setDepositConfirmDate((m.deposit_confirm_date as string) ?? "");

        const tcp =
          m.team_commission_price === null || m.team_commission_price === undefined
            ? fp
            : Number(m.team_commission_price);
        setTeamCommissionPrice(tcp);
        setInitialTeamCommissionPrice(tcp);
        const confBy = (m.commission_price_confirmed_by as string) ?? null;
        setCommissionConfirmedBy(confBy);
        setCommissionConfirmedAt(
          (m.commission_price_confirmed_at as string) ?? null,
        );
        if (confBy) {
          const { data: confProf } = await supabase
            .from("team_member_profiles")
            .select("display_name")
            .eq("user_id", confBy)
            .maybeSingle();
          setCommissionConfirmerName(
            (confProf as { display_name?: string } | null)?.display_name ?? null,
          );
        } else {
          setCommissionConfirmerName(null);
        }
      } else {
        setTeamCommissionPrice(fp);
        setInitialTeamCommissionPrice(fp);
        setCommissionConfirmedBy(null);
        setCommissionConfirmedAt(null);
        setCommissionConfirmerName(null);
        if (uid && closerIds.includes(uid)) {
          // 預設成交人為目前登入者(若身分為 closer)
          setCloserId(uid);
        }
      }

    })();

    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  const applyAdIdWithAutoVideo = (nextAdId: string) => {
    setAdId(nextAdId);
    const adName = nextAdId ? adNameByAdId[nextAdId] : "";
    if (adName) {
      const lower = adName.toLowerCase();
      for (const r of adVideoRules) {
        if (r.keyword && lower.includes(r.keyword.toLowerCase())) {
          setVideoCreatorId(r.video_creator_id);
          return;
        }
      }
    }
    setVideoCreatorId(NONE);
  };




  const handleAddTrafficSource = async () => {
    const name = newTrafficSource.trim();
    if (!name) return;
    if (trafficSources.some((o) => o.name === name)) {
      toast.error("已有相同選項");
      return;
    }
    setAddingTraffic(true);
    try {
      const maxOrder = trafficSources.reduce(
        (m, o) => Math.max(m, o.sort_order ?? 0),
        0,
      );
      const { data, error } = await supabase
        .from("traffic_sources")
        .insert({
          name,
          sort_order: maxOrder + 1,
          created_by: currentUserId,
        })
        .select("id, name, sort_order")
        .single();
      if (error) throw error;
      setTrafficSources((prev) => [...prev, data as OptionRow]);
      setTrafficSource(name);
      setNewTrafficSource("");
      toast.success("已新增來源管道");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "新增失敗";
      if (msg.includes("duplicate") || msg.includes("unique")) {
        toast.error("已有相同選項");
      } else {
        toast.error(msg);
      }
    } finally {
      setAddingTraffic(false);
    }
  };

  const handleAddBookingMethod = async () => {
    const name = newBookingMethod.trim();
    if (!name) return;
    if (bookingMethods.some((o) => o.name === name)) {
      toast.error("已有相同選項");
      return;
    }
    setAddingBooking(true);
    try {
      const maxOrder = bookingMethods.reduce(
        (m, o) => Math.max(m, o.sort_order ?? 0),
        0,
      );
      const { data, error } = await supabase
        .from("booking_methods")
        .insert({
          name,
          sort_order: maxOrder + 1,
          created_by: currentUserId,
        })
        .select("id, name, sort_order")
        .single();
      if (error) throw error;
      setBookingMethods((prev) => [...prev, data as OptionRow]);
      setBookingMethod(name);
      setNewBookingMethod("");
      toast.success("已新增訂房方式");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "新增失敗";
      if (msg.includes("duplicate") || msg.includes("unique")) {
        toast.error("已有相同選項");
      } else {
        toast.error(msg);
      }
    } finally {
      setAddingBooking(false);
    }
  };

  const handleSkip = () => {
    if (saving) return;
    onClose();
  };

  const handleSave = async () => {
    if (!orderId) return;
    setSaving(true);
    try {
      // 抓 accommodation_id
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("accommodation_id")
        .eq("id", orderId)
        .maybeSingle();

      if (orderErr) throw orderErr;

      const payload = {
        order_id: orderId,
        accommodation_id: order?.accommodation_id ?? null,
        closer_id: closerId !== NONE ? closerId : null,
        video_creator_id: videoCreatorId !== NONE ? videoCreatorId : null,
        traffic_source: trafficSource !== NONE ? trafficSource : null,
        booking_method: bookingMethod !== NONE ? bookingMethod : null,
        ad_id: adId.trim() || null,
        franchise_project: franchiseProject !== NONE ? franchiseProject : null,
        member_number: memberNumber.trim() || null,
        is_excluded: isExcluded,
        exclusion_note: exclusionNote.trim() || null,
        inquiry_date: inquiryDate || null,
        voucher_count: Number.isFinite(voucherCount) ? Math.max(0, Math.trunc(voucherCount)) : 0,
        addon_note: addonNote.trim() || null,
        addon_amount: Number.isFinite(addonAmount) ? addonAmount : 0,
        nickname: nickname.trim() || null,
        deposit_confirm_date: depositConfirmDate || null,
        import_source: "manual",
        filled_by: currentUserId,
        filled_at: new Date().toISOString(),
      };


      const { error } = await supabase
        .from("order_meta")
        .upsert(payload, { onConflict: "order_id" });
      if (error) throw error;

      toast.success("行銷資訊已儲存");
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "儲存失敗";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const showDrawer = useMemo(() => open && !!orderId, [open, orderId]);
  if (!orderId) return null;

  return (
    <Sheet open={showDrawer} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>補充行銷資訊</SheetTitle>
          <SheetDescription>此資訊用於獎金計算,可稍後再填</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 py-4">
          {/* 下單日(唯讀) */}
          <div className="space-y-1 p-3 rounded-md bg-muted/40">
            <Label className="text-xs text-muted-foreground">下單日</Label>
            <div className="text-sm">{orderDate || "-"}</div>
          </div>

          {/* 1. 成交人 / 詢問日期 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>成交人</Label>
              <Select value={closerId} onValueChange={setCloserId}>
                <SelectTrigger>
                  <SelectValue placeholder="請選擇成交人" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>未指定</SelectItem>
                  {closers.map((c) => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {c.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>詢問日期</Label>
              <Input
                type="date"
                value={inquiryDate}
                onChange={(e) => setInquiryDate(e.target.value)}
              />
            </div>
          </div>

          {/* 2. 客戶暱稱 / 訂金確認日 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>客戶暱稱</Label>
              <Input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="輸入客戶暱稱"
              />
            </div>
            <div className="space-y-2">
              <Label>訂金確認日</Label>
              <Input
                type="date"
                value={depositConfirmDate}
                onChange={(e) => setDepositConfirmDate(e.target.value)}
              />
            </div>
          </div>

          {/* 3. 廣告編號 / 影音組 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>廣告編號</Label>
              <Input
                value={adId}
                onChange={(e) => applyAdIdWithAutoVideo(e.target.value)}
                placeholder="輸入或點擊下方常用編號"
              />
              {commonAds.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {commonAds.map((a) => (
                    <Button
                      key={a.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyAdIdWithAutoVideo(a.ad_id)}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>影音組</Label>
              <Select value={videoCreatorId} onValueChange={setVideoCreatorId}>
                <SelectTrigger>
                  <SelectValue placeholder="請選擇影音組" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>未指定</SelectItem>
                  {videoCreators.map((v) => (
                    <SelectItem key={v.user_id} value={v.user_id}>
                      {v.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 4. 訂房方式 / 來源管道 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>訂房方式</Label>
              <Select value={bookingMethod} onValueChange={setBookingMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="請選擇訂房方式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>未指定</SelectItem>
                  {bookingMethods.map((o) => (
                    <SelectItem key={o.id} value={o.name}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  value={newBookingMethod}
                  onChange={(e) => setNewBookingMethod(e.target.value)}
                  placeholder="新增選項"
                  className="h-9"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddBookingMethod}
                  disabled={addingBooking || !newBookingMethod.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>來源管道</Label>
              <Select value={trafficSource} onValueChange={setTrafficSource}>
                <SelectTrigger>
                  <SelectValue placeholder="請選擇來源管道" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>未指定</SelectItem>
                  {trafficSources.map((o) => (
                    <SelectItem key={o.id} value={o.name}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  value={newTrafficSource}
                  onChange={(e) => setNewTrafficSource(e.target.value)}
                  placeholder="新增選項"
                  className="h-9"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddTrafficSource}
                  disabled={addingTraffic || !newTrafficSource.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* 5. 加盟專案 / 會員編號 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>加盟專案</Label>
              <Select value={franchiseProject} onValueChange={setFranchiseProject}>
                <SelectTrigger>
                  <SelectValue placeholder="請選擇加盟專案" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>未指定</SelectItem>
                  {franchiseProjects.map((p) => (
                    <SelectItem key={p.id} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>會員編號</Label>
              <Input
                value={memberNumber}
                onChange={(e) => setMemberNumber(e.target.value)}
                placeholder="輸入會員編號"
              />
            </div>
          </div>

          {/* 6. 加購備註 / 加購金額 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>加購備註</Label>
              <Input
                value={addonNote}
                onChange={(e) => setAddonNote(e.target.value)}
                placeholder="輸入加購備註"
              />
            </div>

            <div className="space-y-2">
              <Label>加購金額</Label>
              <Input
                type="number"
                value={addonAmount}
                onChange={(e) =>
                  setAddonAmount(e.target.value === "" ? 0 : Number(e.target.value))
                }
              />
            </div>
          </div>

          {/* 7. 使用住宿券張數 */}
          <div className="space-y-2">
            <Label htmlFor="voucher_count">使用住宿券張數</Label>
            <Input
              id="voucher_count"
              type="number"
              min={0}
              step={1}
              value={voucherCount}
              onChange={(e) =>
                setVoucherCount(
                  e.target.value === "" ? 0 : Math.max(0, Math.trunc(Number(e.target.value))),
                )
              }
            />
          </div>

          {/* 8. 不分潤 / 9. 備註 */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="is_excluded"
                checked={isExcluded}
                onCheckedChange={(v) => setIsExcluded(v === true)}
              />
              <Label htmlFor="is_excluded" className="cursor-pointer">
                不分潤
              </Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exclusion_note">備註</Label>
              <Textarea
                id="exclusion_note"
                value={exclusionNote}
                onChange={(e) => setExclusionNote(e.target.value)}
                placeholder="輸入備註（若勾選不分潤,請填寫原因）"
                rows={3}
              />
            </div>
          </div>
        </div>

        <SheetFooter className="flex flex-row justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={handleSkip} disabled={saving}>
            跳過
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "儲存中..." : "儲存行銷資訊"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
