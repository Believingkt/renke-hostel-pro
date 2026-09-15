import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImagePlus, X, Image as ImageIcon, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { PortalFeatureTagsSection } from "@/components/website-content/PortalFeatureTagsSection";
import SearchRoomCard, { type SearchRoomCardData } from "@/components/booking-portal/SearchRoomCard";

/**
 * 搜尋圖卡設定（自 AdminPackages 抽出）：
 * - 鄰近車站 / 評分 / 簡評 / 地區
 * - 圖卡圖片（最多 5 張）
 * - 特色標籤
 * - 前台搜尋結果預覽
 */
const AdminSearchCard = () => {
  const { currentAccommodationId } = useAccommodation();

  const [accName, setAccName] = useState<string>("");
  const [accType, setAccType] = useState<string | null>(null);
  const [cardSettings, setCardSettings] = useState({
    nearby_station: "",
    review_summary: "",
    rating_score: "" as string,
    country: "",
    region_1: "",
    region_2: "",
  });
  const [cardPhotos, setCardPhotos] = useState<string[]>([]);
  const [cardSaving, setCardSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  // 預覽用：特色標籤（讀已儲存的 override，否則自動推導）
  const [previewTags, setPreviewTags] = useState<string[]>([]);

  useEffect(() => {
    if (!currentAccommodationId) return;
    supabase
      .from("accommodation_info")
      .select(
        "name, type, nearby_station, review_summary, rating_score, search_card_photos, country, region_1, region_2, feature_tags_override"
      )
      .eq("id", currentAccommodationId)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (error) {
          toast({ title: "載入圖卡設定失敗", description: error.message, variant: "destructive" });
          return;
        }
        const d: any = data || {};
        setAccName(d.name ?? "");
        setAccType(d.type ?? null);
        setCardSettings({
          nearby_station: d.nearby_station ?? "",
          review_summary: d.review_summary ?? "",
          rating_score: d.rating_score != null ? String(d.rating_score) : "",
          country: d.country ?? "",
          region_1: d.region_1 ?? "",
          region_2: d.region_2 ?? "",
        });
        setCardPhotos((d.search_card_photos as string[] | null) ?? []);

        if (Array.isArray(d.feature_tags_override) && d.feature_tags_override.length > 0) {
          setPreviewTags(d.feature_tags_override);
        } else {
          setPreviewTags([]);
        }
      });
  }, [currentAccommodationId]);

  const handleCardPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentAccommodationId || !e.target.files?.length) return;
    const files = Array.from(e.target.files);
    const remain = 5 - cardPhotos.length;
    if (remain <= 0) {
      toast({ title: "最多 5 張圖片", variant: "destructive" });
      e.target.value = "";
      return;
    }
    const toUpload = files.slice(0, remain);
    setPhotoUploading(true);
    const newUrls: string[] = [];
    try {
      for (const file of toUpload) {
        if (file.size > 8 * 1024 * 1024) {
          toast({ title: `${file.name} 超過 8MB`, variant: "destructive" });
          continue;
        }
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${currentAccommodationId}/search-card/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("room-photos")
          .upload(path, file, { contentType: file.type, cacheControl: "3600" });
        if (upErr) {
          toast({ title: "上傳失敗", description: upErr.message, variant: "destructive" });
          continue;
        }
        const { data: pub } = supabase.storage.from("room-photos").getPublicUrl(path);
        newUrls.push(pub.publicUrl);
      }
      if (newUrls.length > 0) {
        const merged = [...cardPhotos, ...newUrls].slice(0, 5);
        setCardPhotos(merged);
        const { error } = await supabase
          .from("accommodation_info")
          .update({ search_card_photos: merged })
          .eq("id", currentAccommodationId);
        if (error) {
          toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
        } else {
          toast({ title: `已上傳 ${newUrls.length} 張` });
        }
      }
    } finally {
      setPhotoUploading(false);
      e.target.value = "";
    }
  };

  const removeCardPhoto = async (idx: number) => {
    if (!currentAccommodationId) return;
    const merged = cardPhotos.filter((_, i) => i !== idx);
    setCardPhotos(merged);
    const { error } = await supabase
      .from("accommodation_info")
      .update({ search_card_photos: merged })
      .eq("id", currentAccommodationId);
    if (error) toast({ title: "刪除失敗", description: error.message, variant: "destructive" });
  };

  const moveCardPhoto = async (idx: number, dir: -1 | 1) => {
    if (!currentAccommodationId) return;
    const target = idx + dir;
    if (target < 0 || target >= cardPhotos.length) return;
    const merged = [...cardPhotos];
    [merged[idx], merged[target]] = [merged[target], merged[idx]];
    setCardPhotos(merged);
    await supabase
      .from("accommodation_info")
      .update({ search_card_photos: merged })
      .eq("id", currentAccommodationId);
  };

  const saveCardSettings = async () => {
    if (!currentAccommodationId) return;
    const ratingRaw = cardSettings.rating_score.trim();
    let ratingNum: number | null = null;
    if (ratingRaw !== "") {
      const n = Number(ratingRaw);
      if (Number.isNaN(n) || n < 0 || n > 5) {
        toast({ title: "評分需介於 0 ~ 5", variant: "destructive" });
        return;
      }
      ratingNum = Math.round(n * 10) / 10;
    }
    setCardSaving(true);
    const { error } = await supabase
      .from("accommodation_info")
      .update({
        nearby_station: cardSettings.nearby_station.trim() || null,
        review_summary: cardSettings.review_summary.trim() || null,
        rating_score: ratingNum,
        country: cardSettings.country.trim() || null,
        region_1: cardSettings.region_1.trim() || null,
        region_2: cardSettings.region_2.trim() || null,
      })
      .eq("id", currentAccommodationId);
    setCardSaving(false);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "已更新圖卡設定" });
    }
  };

  const previewData: SearchRoomCardData = useMemo(() => {
    const ratingNum = cardSettings.rating_score.trim()
      ? Number(cardSettings.rating_score)
      : null;
    return {
      id: "preview",
      name: "標準雙人房",
      accommodation_id: currentAccommodationId ?? "preview",
      accommodation_name: accName || "民宿名稱",
      accommodation_type: accType,
      region_1: cardSettings.region_1 || null,
      region_2: cardSettings.region_2 || null,
      country: cardSettings.country || null,
      photo_url: cardPhotos[0] ?? null,
      photo_urls: cardPhotos,
      capacity: 2,
      guest_count_max: 4,
      size_sqm: 28,
      room_count: 1,
      unit_count: 1,
      room_allocation: null,
      is_package: false,
      nearby_station: cardSettings.nearby_station || null,
      review_summary: cardSettings.review_summary || null,
      rating: Number.isFinite(ratingNum as number) ? (ratingNum as number) : null,
      nightly_price: 3800,
      total_price: 7600,
      original_total_price: 8800,
      discount_percent: 14,
      available_rooms: 3,
      n: previewTags,
      feature_tags: previewTags,
      sold_out: false,
    };
  }, [accName, accType, cardSettings, cardPhotos, previewTags, currentAccommodationId]);

  if (!currentAccommodationId) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="搜尋圖卡設定" icon={ImageIcon} />
        <p className="text-sm text-muted-foreground">請先於上方選擇民宿。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="搜尋圖卡設定"
        icon={ImageIcon}
        breadcrumbs={[{ label: "房價庫存" }]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr,420px] gap-6">
        {/* 左：設定區 */}
        <div className="space-y-6">
          {/* 設定卡 */}
          <div className="rounded-lg border bg-card p-4 sm:p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold text-base">搜尋結果圖卡顯示</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  設定本民宿在訂房搜尋結果卡片上顯示的「鄰近車站、評分、簡評」。
                </p>
              </div>
              <Button size="sm" onClick={saveCardSettings} disabled={cardSaving}>
                {cardSaving ? "儲存中…" : "儲存圖卡設定"}
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Label className="text-xs">鄰近車站</Label>
                <Input
                  value={cardSettings.nearby_station}
                  onChange={(e) =>
                    setCardSettings((s) => ({ ...s, nearby_station: e.target.value }))
                  }
                  placeholder="例:步行 5 分鐘至礁溪火車站"
                  maxLength={40}
                />
              </div>
              <div>
                <Label className="text-xs">評分(0 ~ 5)</Label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  value={cardSettings.rating_score}
                  onChange={(e) =>
                    setCardSettings((s) => ({ ...s, rating_score: e.target.value }))
                  }
                  placeholder="例:4.8"
                />
              </div>
              <div className="sm:col-span-3">
                <Label className="text-xs">簡評(一句話亮點)</Label>
                <Input
                  value={cardSettings.review_summary}
                  onChange={(e) =>
                    setCardSettings((s) => ({ ...s, review_summary: e.target.value }))
                  }
                  placeholder="例:寧靜山景湯屋・親子最推薦"
                  maxLength={60}
                />
              </div>

              <div>
                <Label className="text-xs">國家</Label>
                <Input
                  value={cardSettings.country}
                  onChange={(e) => setCardSettings((s) => ({ ...s, country: e.target.value }))}
                  placeholder="例:台灣"
                  maxLength={20}
                />
              </div>
              <div>
                <Label className="text-xs">縣市(地區)</Label>
                <Input
                  value={cardSettings.region_1}
                  onChange={(e) => setCardSettings((s) => ({ ...s, region_1: e.target.value }))}
                  placeholder="例:宜蘭縣"
                  maxLength={20}
                />
              </div>
              <div>
                <Label className="text-xs">鄉鎮市區</Label>
                <Input
                  value={cardSettings.region_2}
                  onChange={(e) => setCardSettings((s) => ({ ...s, region_2: e.target.value }))}
                  placeholder="例:冬山鄉"
                  maxLength={20}
                />
              </div>

              {/* 圖卡圖片 */}
              <div className="sm:col-span-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">
                    圖卡圖片(最多 5 張,會在搜尋結果中讓客人左右滑動)
                  </Label>
                  <span className="text-[11px] text-muted-foreground">
                    {cardPhotos.length} / 5
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {cardPhotos.map((url, i) => (
                    <div
                      key={url + i}
                      className="relative group w-24 h-24 sm:w-28 sm:h-28 rounded-md overflow-hidden border bg-muted"
                    >
                      <img src={url} alt={`圖卡-${i + 1}`} className="w-full h-full object-cover" />
                      <span className="absolute top-1 left-1 text-[10px] px-1 rounded bg-black/60 text-white">
                        {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeCardPhoto(i)}
                        className="absolute top-1 right-1 p-0.5 rounded bg-black/60 text-white hover:bg-destructive"
                        aria-label="刪除"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <div className="absolute bottom-1 left-1 right-1 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => moveCardPhoto(i, -1)}
                          disabled={i === 0}
                          className="px-1.5 py-0.5 text-[10px] rounded bg-white/90 text-foreground disabled:opacity-30"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          onClick={() => moveCardPhoto(i, 1)}
                          disabled={i === cardPhotos.length - 1}
                          className="px-1.5 py-0.5 text-[10px] rounded bg-white/90 text-foreground disabled:opacity-30"
                        >
                          →
                        </button>
                      </div>
                    </div>
                  ))}
                  {cardPhotos.length < 5 && (
                    <label
                      className={`w-24 h-24 sm:w-28 sm:h-28 rounded-md border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer text-muted-foreground hover:border-primary hover:text-primary transition-colors ${
                        photoUploading ? "opacity-50 pointer-events-none" : ""
                      }`}
                    >
                      <ImagePlus className="h-5 w-5" />
                      <span className="text-[11px]">
                        {photoUploading ? "上傳中…" : "新增圖片"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleCardPhotoUpload}
                      />
                    </label>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  建議比例 16:10,單張 ≤ 8MB。第 1 張將作為主圖預設顯示。
                </p>
              </div>
            </div>
          </div>

          {/* 特色標籤(自帶 Card) */}
          <PortalFeatureTagsSection
            accommodationId={currentAccommodationId}
            onPreviewTagsChange={setPreviewTags}
          />
        </div>

        {/* 右:前台預覽 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Eye className="h-4 w-4 text-muted-foreground" />
            前台搜尋結果預覽
          </div>
          <p className="text-[11px] text-muted-foreground">
            預覽會即時反映上方輸入的內容。範例價格與剩餘房數為示意,實際以訂房搜尋計算為準。
          </p>
          <div className="sticky top-4 rounded-xl bg-muted/40 p-3 sm:p-4">
            <div className="mx-auto max-w-[380px]">
              <SearchRoomCard
                data={previewData}
                nights={2}
                onClick={() => {
                  /* 預覽不導頁 */
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSearchCard;
