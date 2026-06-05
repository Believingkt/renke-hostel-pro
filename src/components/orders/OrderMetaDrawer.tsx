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
  const [voucherUsed, setVoucherUsed] = useState(false);
  const [addonNote, setAddonNote] = useState("");
  const [addonAmount, setAddonAmount] = useState<number>(0);
  const [orderDate, setOrderDate] = useState<string | null>(null);
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
      setVoucherUsed(false);
      setAddonNote("");
      setAddonAmount(0);
      setOrderDate(null);
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
          .from("order_meta")
          .select("*")
          .eq("order_id", orderId)
          .maybeSingle(),
        supabase
          .from("orders")
          .select("order_date")
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

      setOrderDate((orderRow as { order_date?: string | null } | null)?.order_date ?? null);

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
        setVoucherUsed(Boolean(m.voucher_used));
        setAddonNote((m.addon_note as string) ?? "");
        setAddonAmount(Number(m.addon_amount ?? 0));
      } else if (uid && closerIds.includes(uid)) {
        // 預設成交人為目前登入者(若身分為 closer)
        setCloserId(uid);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

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
        exclusion_note: isExcluded ? exclusionNote.trim() || null : null,
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
          {/* 成交人 */}
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

          {/* 影音組 */}
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

          {/* 來源管道 */}
          <div className="space-y-2">
            <Label>來源管道</Label>
            <Select value={trafficSource} onValueChange={setTrafficSource}>
              <SelectTrigger>
                <SelectValue placeholder="請選擇來源管道" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>未指定</SelectItem>
                {trafficSources.map((s) => (
                  <SelectItem key={s.id} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
                <div className="border-t mt-1 pt-2 px-2 pb-1 flex gap-1">
                  <Input
                    value={newTrafficSource}
                    onChange={(e) => setNewTrafficSource(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTrafficSource();
                      }
                    }}
                    placeholder="新增來源管道"
                    className="h-8 text-sm"
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    disabled={addingTraffic || !newTrafficSource.trim()}
                    onClick={(e) => {
                      e.preventDefault();
                      handleAddTrafficSource();
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    新增
                  </Button>
                </div>
              </SelectContent>
            </Select>
          </div>

          {/* 訂房方式 */}
          <div className="space-y-2">
            <Label>訂房方式</Label>
            <Select value={bookingMethod} onValueChange={setBookingMethod}>
              <SelectTrigger>
                <SelectValue placeholder="請選擇訂房方式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>未指定</SelectItem>
                {bookingMethods.map((m) => (
                  <SelectItem key={m.id} value={m.name}>
                    {m.name}
                  </SelectItem>
                ))}
                <div className="border-t mt-1 pt-2 px-2 pb-1 flex gap-1">
                  <Input
                    value={newBookingMethod}
                    onChange={(e) => setNewBookingMethod(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddBookingMethod();
                      }
                    }}
                    placeholder="新增訂房方式"
                    className="h-8 text-sm"
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    disabled={addingBooking || !newBookingMethod.trim()}
                    onClick={(e) => {
                      e.preventDefault();
                      handleAddBookingMethod();
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    新增
                  </Button>
                </div>
              </SelectContent>
            </Select>
          </div>

          {/* 廣告編號 */}
          <div className="space-y-2">
            <Label>廣告編號</Label>
            <Input
              value={adId}
              onChange={(e) => setAdId(e.target.value)}
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
                    onClick={() => setAdId(a.ad_id)}
                  >
                    {a.label}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* 加盟專案 */}
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

          {/* 會員編號 */}
          <div className="space-y-2">
            <Label>會員編號</Label>
            <Input
              value={memberNumber}
              onChange={(e) => setMemberNumber(e.target.value)}
              placeholder="輸入會員編號"
            />
          </div>

          {/* 不分潤 */}
          <div className="space-y-2 border-t pt-4">
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
            {isExcluded && (
              <Textarea
                value={exclusionNote}
                onChange={(e) => setExclusionNote(e.target.value)}
                placeholder="請填寫不分潤原因"
                rows={3}
              />
            )}
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
