import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import {
  useAccommodationPackages,
  type AccommodationPackage,
  type PackageTier,
  type PackageInclude,
  type PackageDateRange,
  type PackageTierPrices,
} from "@/hooks/use-accommodation-packages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Copy, GripVertical, Check, X, MinusCircle, ImagePlus, GripHorizontal, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import AdminPackagesPreview from "@/pages/AdminPackagesPreview";
import { PortalFeatureTagsSection } from "@/components/website-content/PortalFeatureTagsSection";
import ChildAgeRulesEditor from "@/components/website-content/ChildAgeRulesEditor";
import {
  DEFAULT_CHILD_AGE_RULES,
  parseChildAgeRules,
  type ChildAgeRules,
} from "@/lib/child-rules";

interface RoomTypeOption {
  id: string;
  name: string;
  capacity?: number;
}

const TIER_OPTIONS: { value: PackageTier; label: string }[] = [
  { value: "weekday", label: "平日" },
  { value: "friday_sunday", label: "旺日（週五/日）" },
  { value: "weekend", label: "假日（週六）" },
];

const TAG_OPTIONS = [
  { value: "best_value", label: "最划算" },
  { value: "early_bird", label: "早鳥優惠" },
  { value: "meal_included", label: "一泊二食" },
  { value: "few_people", label: "少人數包棟" },
];

const NONE = "none";

// 雲岫海景度假會館 — 唯一支援「綁定多房型」的民宿
const YUNXIU_ACCOMMODATION_ID = "7690a606-6bac-4cd5-a3e7-2fa754b318e8";

interface FormState {
  name: string;
  subtitle: string;
  guest_count: number;
  guest_count_max: number | null;
  child_count_max: number | null;
  child_age_note: string;
  original_price: number | null;
  sale_price: number;
  room_allocation: string;
  applicable_tiers: PackageTier[];
  tags: string[];
  includes: PackageInclude[];
  primary_room_type_id: string;
  room_type_ids: string[];
  display_order: number;
  enabled: boolean;
  excluded_date_ranges: PackageDateRange[];
  tier_prices: PackageTierPrices;
  room_type_allocation: Array<{ room_type_id: string; qty: number }>;
  child_age_rules_override: ChildAgeRules | null;
}

const emptyForm = (): FormState => ({
  name: "",
  subtitle: "",
  guest_count: 2,
  guest_count_max: null,
  child_count_max: null,
  child_age_note: "",
  original_price: null,
  sale_price: 0,
  room_allocation: "",
  applicable_tiers: ["weekday", "friday_sunday", "weekend"],
  tags: [],
  includes: [],
  primary_room_type_id: NONE,
  room_type_ids: [],
  display_order: 0,
  enabled: true,
  excluded_date_ranges: [],
  tier_prices: {},
  room_type_allocation: [],
  child_age_rules_override: null,
});

const AdminPackages = () => {
  const { currentAccommodationId } = useAccommodation();
  const { packages, refetch } = useAccommodationPackages(currentAccommodationId, {
    onlyEnabled: false,
  });
  const [roomTypes, setRoomTypes] = useState<RoomTypeOption[]>([]);
  const [editing, setEditing] = useState<AccommodationPackage | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 搜尋結果圖卡顯示設定
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
  const [accommodationDefaultChildRules, setAccommodationDefaultChildRules] =
    useState<ChildAgeRules>(DEFAULT_CHILD_AGE_RULES);

  // 禮遇範本庫（民宿層）：可建立多組命名範本，方案編輯時一鍵套用至「附加說明」
  type PerkItem = { text: string; enabled: boolean };
  type PerkTemplate = { id: string; name: string; title: string; items: PerkItem[] };
  const makeTemplateId = () =>
    (globalThis.crypto?.randomUUID?.() ?? `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const newTemplate = (): PerkTemplate => ({
    id: makeTemplateId(),
    name: "新範本",
    title: "尊榮禮遇",
    items: [{ text: "", enabled: true }],
  });
  const [perkTemplates, setPerkTemplates] = useState<PerkTemplate[]>([]);
  const [perksSaving, setPerksSaving] = useState(false);
  const [expandedTplId, setExpandedTplId] = useState<string | null>(null);
  const [pendingTplId, setPendingTplId] = useState<string>("");

  useEffect(() => {
    if (!currentAccommodationId) return;
    supabase
      .from("room_types")
      .select("id, name, capacity")
      .eq("accommodation_id", currentAccommodationId)
      .order("display_order", { ascending: true })
      .then(({ data }) => setRoomTypes((data || []) as RoomTypeOption[]));

    supabase
      .from("accommodation_info")
      .select("nearby_station, review_summary, rating_score, search_card_photos, country, region_1, region_2, child_age_rules, villa_perk_templates")
      .eq("id", currentAccommodationId)
      .maybeSingle()
      .then(({ data }) => {
        setCardSettings({
          nearby_station: (data as any)?.nearby_station ?? "",
          review_summary: (data as any)?.review_summary ?? "",
          rating_score:
            (data as any)?.rating_score != null ? String((data as any).rating_score) : "",
          country: (data as any)?.country ?? "",
          region_1: (data as any)?.region_1 ?? "",
          region_2: (data as any)?.region_2 ?? "",
        });
        setCardPhotos(((data as any)?.search_card_photos as string[] | null) ?? []);
        setAccommodationDefaultChildRules(parseChildAgeRules((data as any)?.child_age_rules));
        const raw = (data as any)?.villa_perk_templates;
        if (Array.isArray(raw)) {
          setPerkTemplates(
            raw
              .filter((t: any) => t && typeof t === "object")
              .map((t: any) => ({
                id: typeof t.id === "string" ? t.id : makeTemplateId(),
                name: typeof t.name === "string" ? t.name : "未命名範本",
                title: typeof t.title === "string" ? t.title : "尊榮禮遇",
                items: Array.isArray(t.items)
                  ? t.items
                      .filter((it: any) => it && typeof it.text === "string")
                      .map((it: any) => ({ text: it.text, enabled: it.enabled !== false }))
                  : [],
              }))
          );
        } else {
          setPerkTemplates([]);
        }
      });
  }, [currentAccommodationId]);

  const savePerkTemplates = async () => {
    if (!currentAccommodationId) return;
    setPerksSaving(true);
    const payload = perkTemplates.map((t) => ({
      id: t.id,
      name: (t.name || "").trim() || "未命名範本",
      title: (t.title || "").trim() || "尊榮禮遇",
      items: t.items
        .filter((it) => (it.text || "").trim() !== "")
        .map((it) => ({ text: it.text.trim(), enabled: !!it.enabled })),
    }));
    const { error } = await supabase
      .from("accommodation_info")
      .update({ villa_perk_templates: payload as any })
      .eq("id", currentAccommodationId);
    setPerksSaving(false);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "已儲存禮遇範本庫" });
    }
  };

  const updateTemplate = (id: string, patch: Partial<PerkTemplate>) =>
    setPerkTemplates((arr) => arr.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const updateTemplateItem = (tplId: string, idx: number, patch: Partial<PerkItem>) =>
    setPerkTemplates((arr) =>
      arr.map((t) =>
        t.id === tplId
          ? { ...t, items: t.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }
          : t
      )
    );
  const addTemplateItem = (tplId: string) =>
    setPerkTemplates((arr) =>
      arr.map((t) =>
        t.id === tplId ? { ...t, items: [...t.items, { text: "", enabled: true }] } : t
      )
    );
  const removeTemplateItem = (tplId: string, idx: number) =>
    setPerkTemplates((arr) =>
      arr.map((t) =>
        t.id === tplId ? { ...t, items: t.items.filter((_, i) => i !== idx) } : t
      )
    );
  const moveTemplateItem = (tplId: string, idx: number, dir: -1 | 1) =>
    setPerkTemplates((arr) =>
      arr.map((t) => {
        if (t.id !== tplId) return t;
        const j = idx + dir;
        if (j < 0 || j >= t.items.length) return t;
        const items = [...t.items];
        [items[idx], items[j]] = [items[j], items[idx]];
        return { ...t, items };
      })
    );



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

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm({
      ...emptyForm(),
      display_order: (packages[packages.length - 1]?.display_order ?? 0) + 1,
    });
    setOpen(true);
  }, [packages]);

  const openEdit = (pkg: AccommodationPackage) => {
    setEditing(pkg);
    setForm({
      name: pkg.name,
      subtitle: pkg.subtitle ?? "",
      guest_count: pkg.guest_count,
      guest_count_max: pkg.guest_count_max,
      child_count_max: pkg.child_count_max,
      child_age_note: pkg.child_age_note ?? "",
      original_price: pkg.original_price,
      sale_price: pkg.sale_price,
      room_allocation: pkg.room_allocation ?? "",
      applicable_tiers: pkg.applicable_tiers,
      tags: pkg.tags,
      includes: pkg.includes ?? [],
      primary_room_type_id: pkg.primary_room_type_id ?? NONE,
      room_type_ids: (pkg as any).room_type_ids && Array.isArray((pkg as any).room_type_ids) && (pkg as any).room_type_ids.length
        ? ((pkg as any).room_type_ids as string[])
        : (pkg.primary_room_type_id ? [pkg.primary_room_type_id] : []),
      display_order: pkg.display_order,
      enabled: pkg.enabled,
      excluded_date_ranges: Array.isArray(pkg.excluded_date_ranges)
        ? pkg.excluded_date_ranges.map((r) => ({ ...r }))
        : [],
      tier_prices: pkg.tier_prices ? { ...pkg.tier_prices } : {},
      room_type_allocation: Array.isArray((pkg as any).room_type_allocation)
        ? (pkg as any).room_type_allocation.map((r: any) => ({ room_type_id: r.room_type_id, qty: Number(r.qty) || 1 }))
        : [],
      child_age_rules_override: pkg.child_age_rules_override
        ? parseChildAgeRules(pkg.child_age_rules_override)
        : null,
    });
    setOpen(true);
  };

  const handleCopy = (pkg: AccommodationPackage) => {
    setEditing(null);
    setForm({
      name: `${pkg.name} - 複製`,
      subtitle: pkg.subtitle ?? "",
      guest_count: pkg.guest_count,
      guest_count_max: pkg.guest_count_max,
      child_count_max: pkg.child_count_max,
      child_age_note: pkg.child_age_note ?? "",
      original_price: pkg.original_price,
      sale_price: pkg.sale_price,
      room_allocation: pkg.room_allocation ?? "",
      applicable_tiers: pkg.applicable_tiers,
      tags: [...pkg.tags],
      includes: pkg.includes ? pkg.includes.map((inc) => ({ ...inc })) : [],
      primary_room_type_id: pkg.primary_room_type_id ?? NONE,
      room_type_ids: (pkg as any).room_type_ids && Array.isArray((pkg as any).room_type_ids) && (pkg as any).room_type_ids.length
        ? ([...((pkg as any).room_type_ids as string[])])
        : (pkg.primary_room_type_id ? [pkg.primary_room_type_id] : []),
      display_order: (packages[packages.length - 1]?.display_order ?? 0) + 1,
      enabled: pkg.enabled,
      excluded_date_ranges: Array.isArray(pkg.excluded_date_ranges)
        ? pkg.excluded_date_ranges.map((r) => ({ ...r }))
        : [],
      tier_prices: pkg.tier_prices ? { ...pkg.tier_prices } : {},
      room_type_allocation: Array.isArray((pkg as any).room_type_allocation)
        ? (pkg as any).room_type_allocation.map((r: any) => ({ room_type_id: r.room_type_id, qty: Number(r.qty) || 1 }))
        : [],
      child_age_rules_override: pkg.child_age_rules_override
        ? parseChildAgeRules(pkg.child_age_rules_override)
        : null,
    });
    setOpen(true);
  };

  const toggleEnabled = async (pkg: AccommodationPackage) => {
    const { error } = await supabase
      .from("accommodation_packages")
      .update({ enabled: !pkg.enabled })
      .eq("id", pkg.id);
    if (error) toast({ title: "更新失敗", description: error.message, variant: "destructive" });
    else refetch();
  };

  const handleSave = async () => {
    if (!currentAccommodationId) return;
    if (!form.name.trim()) {
      toast({ title: "請輸入方案名稱", variant: "destructive" });
      return;
    }
    if (form.applicable_tiers.length === 0) {
      toast({ title: "請至少勾選一個適用日", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      accommodation_id: currentAccommodationId,
      name: form.name.trim(),
      subtitle: form.subtitle.trim() || null,
      guest_count: form.guest_count,
      guest_count_max: form.guest_count_max,
      child_count_max: form.child_count_max,
      child_age_note: form.child_age_note.trim() || null,
      original_price: form.original_price,
      sale_price: form.sale_price,
      room_allocation: form.room_allocation.trim() || null,
      applicable_tiers: form.applicable_tiers,
      tags: form.tags,
      includes: form.includes as any,
      primary_room_type_id: (() => {
        // 雲岫使用多選；其他民宿使用單選下拉
        if (currentAccommodationId === YUNXIU_ACCOMMODATION_ID) {
          return form.room_type_ids[0] ?? null;
        }
        return form.primary_room_type_id === NONE ? null : form.primary_room_type_id;
      })(),
      room_type_ids:
        currentAccommodationId === YUNXIU_ACCOMMODATION_ID
          ? (form.room_type_ids.length ? form.room_type_ids : null)
          : (form.primary_room_type_id === NONE ? null : [form.primary_room_type_id]),
      display_order: form.display_order,
      enabled: form.enabled,
      excluded_date_ranges: (form.excluded_date_ranges || []).filter(
        (r) => r.start && r.end && r.start <= r.end
      ) as any,
      tier_prices: Object.fromEntries(
        Object.entries(form.tier_prices || {}).filter(
          ([, v]) => v && typeof v.sale === "number" && !Number.isNaN(v.sale)
        )
      ) as any,
      room_type_allocation: (form.room_type_allocation || [])
        .filter((r) => r.room_type_id && Number(r.qty) > 0)
        .map((r) => ({ room_type_id: r.room_type_id, qty: Number(r.qty) })) as any,
      child_age_rules_override: form.child_age_rules_override as any,
    };
    const { error } = editing
      ? await supabase.from("accommodation_packages").update(payload as any).eq("id", editing.id)
      : await supabase.from("accommodation_packages").insert([payload as any]);
    setSaving(false);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
      return;
    }



    toast({ title: editing ? "已更新" : "已新增" });
    setOpen(false);
    refetch();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("accommodation_packages").delete().eq("id", deleteId);
    if (error) toast({ title: "刪除失敗", description: error.message, variant: "destructive" });
    else {
      toast({ title: "已刪除" });
      refetch();
    }
    setDeleteId(null);
  };

  const updateInclude = (i: number, patch: Partial<PackageInclude>) => {
    setForm((f) => ({
      ...f,
      includes: f.includes.map((inc, idx) => (idx === i ? { ...inc, ...patch } : inc)),
    }));
  };

  const addInclude = () =>
    setForm((f) => ({
      ...f,
      includes: [...f.includes, { text: "", available: "yes" }],
    }));

  const removeInclude = (i: number) =>
    setForm((f) => ({ ...f, includes: f.includes.filter((_, idx) => idx !== i) }));

  if (!currentAccommodationId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">請先選擇民宿</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <AdminPageHeader
        title="訂房入住方案"
        description="設定民宿首頁訂房區顯示的銷售方案。啟用後，前台會以方案卡取代房型列表。"
        action={
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            新增方案
          </Button>
        }
      />

      {/* 禮遇範本庫（民宿層）：可建立多組命名範本，方案編輯時一鍵套用至「附加說明」 */}
      <div className="rounded-lg border bg-card p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-base">禮遇範本庫</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              建立常用的禮遇條列組合（例：一泊二食、純住宿、包棟尊榮）。新增/編輯方案時可在「附加說明」一鍵套用，套用後完全脫鉤、可任意修改而不影響範本。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const tpl = newTemplate();
                setPerkTemplates((arr) => [...arr, tpl]);
                setExpandedTplId(tpl.id);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              新增範本
            </Button>
            <Button size="sm" onClick={savePerkTemplates} disabled={perksSaving}>
              {perksSaving ? "儲存中…" : "儲存範本庫"}
            </Button>
          </div>
        </div>

        {perkTemplates.length === 0 && (
          <p className="text-[12px] text-muted-foreground rounded-md border border-dashed bg-muted/20 px-3 py-3 text-center">
            尚未建立任何範本。按「新增範本」開始建立第一組常用禮遇。
          </p>
        )}

        <div className="space-y-3">
          {perkTemplates.map((tpl) => {
            const isOpen = expandedTplId === tpl.id;
            const enabledCount = tpl.items.filter((it) => it.enabled && it.text.trim()).length;
            return (
              <div key={tpl.id} className="rounded-md border bg-background">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setExpandedTplId(isOpen ? null : tpl.id)}
                    className="text-xs text-muted-foreground hover:text-foreground shrink-0 w-5"
                    aria-label={isOpen ? "收合" : "展開"}
                  >
                    {isOpen ? "▾" : "▸"}
                  </button>
                  <Input
                    value={tpl.name}
                    onChange={(e) => updateTemplate(tpl.id, { name: e.target.value })}
                    placeholder="範本名稱（例：一泊二食）"
                    className="flex-1 h-8"
                    maxLength={20}
                  />
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {enabledCount} 條
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (!confirm(`確定要刪除範本「${tpl.name}」？`)) return;
                      setPerkTemplates((arr) => arr.filter((t) => t.id !== tpl.id));
                      if (expandedTplId === tpl.id) setExpandedTplId(null);
                    }}
                    title="刪除範本"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                {isOpen && (
                  <div className="border-t bg-muted/10 px-3 py-3 space-y-3">
                    <div>
                      <Label className="text-xs">區塊標題（顯示在前台禮遇上方）</Label>
                      <Input
                        value={tpl.title}
                        onChange={(e) => updateTemplate(tpl.id, { title: e.target.value })}
                        placeholder="例：尊榮禮遇"
                        maxLength={20}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">禮遇條列</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => addTemplateItem(tpl.id)}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          新增一條
                        </Button>
                      </div>
                      <ul className="space-y-2">
                        {tpl.items.map((it, idx) => (
                          <li
                            key={idx}
                            className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5"
                          >
                            <Switch
                              checked={it.enabled}
                              onCheckedChange={(v) => updateTemplateItem(tpl.id, idx, { enabled: v })}
                            />
                            <Input
                              value={it.text}
                              onChange={(e) => updateTemplateItem(tpl.id, idx, { text: e.target.value })}
                              placeholder="例：私人管家全程接待"
                              maxLength={40}
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => removeTemplateItem(tpl.id, idx)}
                              title="刪除"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                      <p className="text-[11px] text-muted-foreground">
                        每條最多 40 字；關閉開關可暫時隱藏該條而不需刪除。
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 搜尋結果圖卡顯示設定已移至「房價庫存 → 搜尋圖卡設定」分頁 */}



      {packages.length === 0 ? (
        <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
          尚未建立任何銷售方案。點右上角「新增方案」開始。
        </div>
      ) : (
        <div className="space-y-2">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className="flex items-center gap-3 p-3 border rounded-lg bg-card hover:shadow-sm transition-shadow"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold truncate">{pkg.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {pkg.guest_count} 人
                    {pkg.guest_count_max && pkg.guest_count_max !== pkg.guest_count
                      ? `~${pkg.guest_count_max}`
                      : ""}
                  </span>
                  {pkg.tags.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(25,70%,90%)] text-[hsl(25,70%,40%)]"
                    >
                      {TAG_OPTIONS.find((o) => o.value === t)?.label || t}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                  <span>
                    NT$ {pkg.sale_price.toLocaleString()}
                    {pkg.original_price && pkg.original_price > pkg.sale_price && (
                      <span className="line-through ml-1.5">
                        {pkg.original_price.toLocaleString()}
                      </span>
                    )}
                  </span>
                  <span>
                    適用：
                    {pkg.applicable_tiers
                      .map((t) => TIER_OPTIONS.find((o) => o.value === t)?.label)
                      .join(" / ")}
                  </span>
                </div>
              </div>
              <Switch checked={pkg.enabled} onCheckedChange={() => toggleEnabled(pkg)} />
              <Button variant="ghost" size="icon" onClick={() => openEdit(pkg)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleCopy(pkg)}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleteId(pkg.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯方案" : "新增方案"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>方案名稱 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例：悠活銷售方案"
              />
            </div>

            <div>
              <Label>副標（選填）</Label>
              <Input
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                placeholder="例：含早鳥優惠"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>建議人數 *</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.guest_count}
                  onChange={(e) =>
                    setForm({ ...form, guest_count: parseInt(e.target.value, 10) || 1 })
                  }
                />
              </div>
              <div>
                <Label>人數上限（選填）</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.guest_count_max ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      guest_count_max: e.target.value ? parseInt(e.target.value, 10) : null,
                    })
                  }
                  placeholder="例：10"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>兒童人數上限（選填）</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.child_count_max ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      child_count_max: e.target.value ? parseInt(e.target.value, 10) : null,
                    })
                  }
                  placeholder="例：2"
                />
              </div>
              <div>
                <Label>兒童年齡備註（選填）</Label>
                <Input
                  value={form.child_age_note}
                  onChange={(e) => setForm({ ...form, child_age_note: e.target.value })}
                  placeholder="例：6 歲以下不佔床"
                />
              </div>
            </div>

            <div className="rounded-lg border border-border/60 p-3 space-y-2">
              <div className="text-sm font-medium">兒童分齡與加價（方案層）</div>
              <p className="text-xs text-muted-foreground">
                未開啟覆寫時，沿用民宿層的兒童分齡規則。開啟覆寫後，可獨立設定該方案的年齡區間、人數上限與每晚加價。
              </p>
              <ChildAgeRulesEditor
                value={form.child_age_rules_override ?? accommodationDefaultChildRules}
                onChange={(next) => setForm({ ...form, child_age_rules_override: next })}
                showNote={false}
                overrideToggle={{
                  enabled: form.child_age_rules_override !== null,
                  onToggle: (enabled) =>
                    setForm({
                      ...form,
                      child_age_rules_override: enabled
                        ? parseChildAgeRules(
                            form.child_age_rules_override ?? accommodationDefaultChildRules,
                          )
                        : null,
                    }),
                  defaultRulesPreview: accommodationDefaultChildRules,
                }}
              />
            </div>


            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>原價（選填，劃掉用）</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.original_price ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      original_price: e.target.value ? parseFloat(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div>
                <Label>售價 *</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.sale_price}
                  onChange={(e) =>
                    setForm({ ...form, sale_price: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            {/* 分日型價格覆寫 */}
            <div className="rounded-lg border border-dashed p-3 space-y-2 bg-muted/20">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <Label className="text-sm">分日型價格（選填）</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    為平日／旺日／假日各自設定不同價格。未設定的日型自動沿用上方預設售價／原價。
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TIER_OPTIONS.filter((o) => !form.tier_prices?.[o.value]).map((opt) => (
                    <Button
                      key={opt.value}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          tier_prices: {
                            ...f.tier_prices,
                            [opt.value]: {
                              original: f.original_price ?? null,
                              sale: f.sale_price || 0,
                            },
                          },
                        }))
                      }
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
              {Object.keys(form.tier_prices || {}).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  尚未設定任何分日型價格，所有適用日將使用上方預設售價／原價。
                </p>
              ) : (
                <div className="space-y-2">
                  {TIER_OPTIONS.filter((o) => form.tier_prices?.[o.value]).map((opt) => {
                    const entry = form.tier_prices[opt.value]!;
                    return (
                      <div
                        key={opt.value}
                        className="grid grid-cols-[90px_1fr_1fr_auto] gap-2 items-center"
                      >
                        <span className="text-sm font-medium">{opt.label}</span>
                        <div>
                          <Input
                            type="number"
                            min={0}
                            placeholder="原價（選填）"
                            value={entry.original ?? ""}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                tier_prices: {
                                  ...f.tier_prices,
                                  [opt.value]: {
                                    ...f.tier_prices[opt.value]!,
                                    original: e.target.value
                                      ? parseFloat(e.target.value)
                                      : null,
                                  },
                                },
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Input
                            type="number"
                            min={0}
                            placeholder="售價"
                            value={entry.sale}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                tier_prices: {
                                  ...f.tier_prices,
                                  [opt.value]: {
                                    ...f.tier_prices[opt.value]!,
                                    sale: parseFloat(e.target.value) || 0,
                                  },
                                },
                              }))
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setForm((f) => {
                              const next = { ...f.tier_prices };
                              delete next[opt.value];
                              return { ...f, tier_prices: next };
                            })
                          }
                        >
                          <MinusCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <Label>房型分配（用逗號分隔）</Label>
              <Input
                value={form.room_allocation}
                onChange={(e) => setForm({ ...form, room_allocation: e.target.value })}
                placeholder="例：豪華雙人房 x 2、溫馨四人房 x 1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                純文字描述。當下方「結構化房型分配」沒設定時，前台才會 fallback 顯示此文字。
              </p>
            </div>

            <div>
              <Label>房型分配（結構化・含縮圖）</Label>
              <p className="text-[11px] text-muted-foreground mb-2">
                指定此包區方案實際入住的房型與數量。設定後前台會在方案卡內顯示房型縮圖（如「四人房 × 3」）。
              </p>
              <div className="space-y-2 rounded-md border p-3">
                {form.room_type_allocation.length === 0 && (
                  <p className="text-xs text-muted-foreground">尚未設定，點下方按鈕新增。</p>
                )}
                {form.room_type_allocation.map((alloc, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select
                      value={alloc.room_type_id || NONE}
                      onValueChange={(v) =>
                        setForm((f) => {
                          const next = [...f.room_type_allocation];
                          next[idx] = { ...next[idx], room_type_id: v === NONE ? "" : v };
                          return { ...f, room_type_allocation: next };
                        })
                      }
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="選擇房型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>未選擇</SelectItem>
                        {roomTypes.map((rt) => (
                          <SelectItem key={rt.id} value={rt.id}>
                            {rt.name}（{rt.capacity}人）
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={1}
                      className="w-20"
                      value={alloc.qty}
                      onChange={(e) => {
                        const n = Math.max(1, parseInt(e.target.value || "1", 10) || 1);
                        setForm((f) => {
                          const next = [...f.room_type_allocation];
                          next[idx] = { ...next[idx], qty: n };
                          return { ...f, room_type_allocation: next };
                        });
                      }}
                    />
                    <span className="text-xs text-muted-foreground">間</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          room_type_allocation: f.room_type_allocation.filter((_, i) => i !== idx),
                        }))
                      }
                    >
                      <MinusCircle className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      room_type_allocation: [
                        ...f.room_type_allocation,
                        { room_type_id: "", qty: 1 },
                      ],
                    }))
                  }
                >
                  + 新增房型
                </Button>
              </div>
            </div>

            <div>
              <Label>綁定主房型（用於庫存）</Label>
              {currentAccommodationId === YUNXIU_ACCOMMODATION_ID ? (
                <div className="mt-2 space-y-2 rounded-md border p-3">
                  {roomTypes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">尚無房型</p>
                  ) : (
                    roomTypes.map((rt) => {
                      const checked = form.room_type_ids.includes(rt.id);
                      const orderIdx = form.room_type_ids.indexOf(rt.id);
                      return (
                        <label
                          key={rt.id}
                          className="flex items-center gap-2 cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(c) => {
                              setForm((f) => ({
                                ...f,
                                room_type_ids: c
                                  ? [...f.room_type_ids, rt.id]
                                  : f.room_type_ids.filter((id) => id !== rt.id),
                              }));
                            }}
                          />
                          <span>{rt.name}</span>
                          {checked && (
                            <span className="text-xs text-muted-foreground">
                              {orderIdx === 0 ? "（主房型 / 下單預設）" : `（順位 ${orderIdx + 1}）`}
                            </span>
                          )}
                        </label>
                      );
                    })
                  )}
                  <p className="text-xs text-muted-foreground pt-1">
                    可複選；第一個勾選的房型將作為訂房連結預設帶入的房型，庫存依下單時實際選擇的房型扣抵。
                  </p>
                </div>
              ) : (
                <Select
                  value={form.primary_room_type_id}
                  onValueChange={(v) => setForm({ ...form, primary_room_type_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇房型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>未綁定</SelectItem>
                    {roomTypes.map((rt) => (
                      <SelectItem key={rt.id} value={rt.id}>
                        {rt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <Label>適用日 *</Label>
              <div className="flex flex-wrap gap-3 mt-2">
                {TIER_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={form.applicable_tiers.includes(opt.value)}
                      onCheckedChange={(c) => {
                        setForm((f) => ({
                          ...f,
                          applicable_tiers: c
                            ? [...f.applicable_tiers, opt.value]
                            : f.applicable_tiers.filter((t) => t !== opt.value),
                        }));
                      }}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <Label>不適用日期區間</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    入住日落在區間內（含起訖日）時，此方案不會出現在前台。
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      excluded_date_ranges: [
                        ...f.excluded_date_ranges,
                        { start: "", end: "" },
                      ],
                    }))
                  }
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  新增區間
                </Button>
              </div>
              {form.excluded_date_ranges.length === 0 ? (
                <p className="text-xs text-muted-foreground">尚未設定，方案任何日期皆適用。</p>
              ) : (
                <div className="space-y-2">
                  {form.excluded_date_ranges.map((r, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input
                        type="date"
                        value={r.start}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            excluded_date_ranges: f.excluded_date_ranges.map((x, idx) =>
                              idx === i ? { ...x, start: e.target.value } : x
                            ),
                          }))
                        }
                      />
                      <span className="text-muted-foreground text-sm shrink-0">至</span>
                      <Input
                        type="date"
                        value={r.end}
                        min={r.start || undefined}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            excluded_date_ranges: f.excluded_date_ranges.map((x, idx) =>
                              idx === i ? { ...x, end: e.target.value } : x
                            ),
                          }))
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            excluded_date_ranges: f.excluded_date_ranges.filter(
                              (_, idx) => idx !== i
                            ),
                          }))
                        }
                      >
                        <MinusCircle className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label>標籤</Label>
              <div className="flex flex-wrap gap-3 mt-2">
                {TAG_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={form.tags.includes(opt.value)}
                      onCheckedChange={(c) => {
                        setForm((f) => ({
                          ...f,
                          tags: c
                            ? [...f.tags, opt.value]
                            : f.tags.filter((t) => t !== opt.value),
                        }));
                      }}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <Label>附加說明</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  {perkTemplates.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">📋 套用範本</span>
                      <Select
                        value={pendingTplId}
                        onValueChange={(v) => setPendingTplId(v)}
                      >
                        <SelectTrigger className="w-[180px] h-8 text-xs">
                          <SelectValue placeholder="選擇範本…" />
                        </SelectTrigger>
                        <SelectContent>
                          {perkTemplates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}（{t.items.filter((it) => it.enabled && it.text.trim()).length} 條）
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={!pendingTplId}
                        onClick={() => {
                          const tpl = perkTemplates.find((t) => t.id === pendingTplId);
                          if (!tpl) return;
                          const newIncludes = tpl.items
                            .filter((it) => it.enabled && it.text.trim())
                            .map((it) => ({ available: "yes" as const, text: it.text, price_note: null }));
                          setForm((f) => ({ ...f, includes: newIncludes }));
                          toast({ title: `已套用範本「${tpl.name}」`, description: "已取代附加說明，可繼續微調" });
                        }}
                      >
                        取代
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        disabled={!pendingTplId}
                        onClick={() => {
                          const tpl = perkTemplates.find((t) => t.id === pendingTplId);
                          if (!tpl) return;
                          const appended = tpl.items
                            .filter((it) => it.enabled && it.text.trim())
                            .map((it) => ({ available: "yes" as const, text: it.text, price_note: null }));
                          setForm((f) => ({ ...f, includes: [...f.includes, ...appended] }));
                          toast({ title: `已附加範本「${tpl.name}」` });
                        }}
                      >
                        附加
                      </Button>
                    </div>
                  )}
                  <Button type="button" size="sm" variant="outline" onClick={addInclude}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    新增
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {form.includes.map((inc, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <Select
                      value={inc.available}
                      onValueChange={(v: any) => updateInclude(i, { available: v })}
                    >
                      <SelectTrigger className="w-[100px] shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">
                          <span className="flex items-center gap-1.5">
                            <Check className="h-3.5 w-3.5 text-emerald-500" />包含
                          </span>
                        </SelectItem>
                        <SelectItem value="optional">
                          <span className="flex items-center gap-1.5">
                            <Plus className="h-3.5 w-3.5 text-[hsl(25,70%,50%)]" />可選
                          </span>
                        </SelectItem>
                        <SelectItem value="no">
                          <span className="flex items-center gap-1.5">
                            <X className="h-3.5 w-3.5 text-rose-400" />不含
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={inc.text}
                      onChange={(e) => updateInclude(i, { text: e.target.value })}
                      placeholder="例：包含田園精緻早餐"
                    />
                    <Input
                      value={inc.price_note ?? ""}
                      onChange={(e) => updateInclude(i, { price_note: e.target.value })}
                      placeholder="備註（選填）"
                      className="w-[140px] shrink-0"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeInclude(i)}
                    >
                      <MinusCircle className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <Label>排序</Label>
                <Input
                  type="number"
                  value={form.display_order}
                  onChange={(e) =>
                    setForm({ ...form, display_order: parseInt(e.target.value, 10) || 0 })
                  }
                />
              </div>
              <label className="flex items-center gap-2 pb-2">
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(c) => setForm({ ...form, enabled: c })}
                />
                <span className="text-sm">啟用此方案</span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "儲存中..." : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除方案？</AlertDialogTitle>
            <AlertDialogDescription>
              此動作無法復原。確定要刪除此銷售方案嗎？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive">
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="rounded-lg border bg-card p-4 sm:p-5 space-y-3">
        <div>
          <h3 className="font-semibold text-base">方案前台預覽</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            模擬入住日期與人數，即時預覽銷售方案在訂房前台的呈現
          </p>
        </div>
        <AdminPackagesPreview embedded />
      </div>
    </div>
  );
};

export default AdminPackages;
