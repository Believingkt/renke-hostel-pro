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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TRAFFIC_SOURCES = [
  "貝瑞FB",
  "貝瑞IG",
  "人客多LINE@",
  "人客多IG",
  "人客多FB",
  "森山LINE@",
  "轉介紹",
  "Threads",
  "網站預訂",
  "票券平台",
];

const BOOKING_METHODS = [
  "人客多代訂",
  "外移代訂",
  "森山代訂",
  "人客多票券",
  "網站預訂",
  "特殊價格",
];

interface TeamOption {
  user_id: string;
  display_name: string;
}

interface CommonAd {
  id: string;
  label: string;
  ad_id: string;
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

  const [closerId, setCloserId] = useState<string>(NONE);
  const [videoCreatorId, setVideoCreatorId] = useState<string>(NONE);
  const [trafficSource, setTrafficSource] = useState<string>(NONE);
  const [bookingMethod, setBookingMethod] = useState<string>(NONE);
  const [adId, setAdId] = useState("");
  const [isExcluded, setIsExcluded] = useState(false);
  const [exclusionNote, setExclusionNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset form whenever a new order opens the drawer
  useEffect(() => {
    if (open && orderId) {
      setCloserId(NONE);
      setVideoCreatorId(NONE);
      setTrafficSource(NONE);
      setBookingMethod(NONE);
      setAdId("");
      setIsExcluded(false);
      setExclusionNote("");
    }
  }, [open, orderId]);

  // Load team options + common ads + current user
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      const [
        { data: sessionRes },
        { data: closerRoles },
        { data: videoRoles },
        { data: ads },
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
      ]);

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

      // 預設成交人為目前登入者(若身分為 closer)
      if (uid && closerIds.includes(uid)) {
        setCloserId(uid);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

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
        is_excluded: isExcluded,
        exclusion_note: isExcluded ? exclusionNote.trim() || null : null,
        import_source: "manual",
        filled_by: currentUserId,
        filled_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("order_meta").insert(payload);
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
                {TRAFFIC_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
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
                {BOOKING_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
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
