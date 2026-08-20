import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, GripVertical, Plus, Trash2, Upload } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
import { BrandLogoBar } from "@/components/BrandLogoBar";
import {
  BRAND_PARTNER_SCOPES,
  useAllBrandPartners,
  type BrandPartner,
} from "@/hooks/useBrandPartners";
import { LOGO_ACCEPTED_TYPES, LOGO_MAX_UPLOAD_BYTES, normalizeLogo } from "@/lib/logoNormalize";

function PartnerRow({
  partner,
  onChange,
  onDelete,
}: {
  partner: BrandPartner;
  onChange: (patch: Partial<BrandPartner>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: partner.id,
  });
  const [uploading, setUploading] = useState(false);
  const [portalConfirm, setPortalConfirm] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const toggleScope = (scope: string, checked: boolean) => {
    if (scope === "portal" && checked) {
      setPortalConfirm(true);
      return;
    }
    const next = checked
      ? [...new Set([...partner.scopes, scope])]
      : partner.scopes.filter((s) => s !== scope);
    onChange({ scopes: next });
  };

  const handleUpload = async (file: File) => {
    if (!LOGO_ACCEPTED_TYPES.includes(file.type)) {
      toast.error("僅支援 PNG / WebP / SVG（避免 JPEG 以保留透明底）");
      return;
    }
    if (file.size > LOGO_MAX_UPLOAD_BYTES) {
      toast.error("檔案請小於 2MB");
      return;
    }
    setUploading(true);
    try {
      let uploadBody: Blob = file;
      let ext = "png";
      if (file.type === "image/svg+xml") {
        ext = "svg";
      } else {
        const normalized = await normalizeLogo(file);
        uploadBody = normalized.blob;
        ext = "webp";
      }
      const path = `brand-partners/${partner.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("logos")
        .upload(path, uploadBody, { contentType: uploadBody.type || file.type, upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("logos").getPublicUrl(path);
      onChange({ logo_url: data.publicUrl });
      toast.success("Logo 已更新（已自動等比縮放並補透明邊）");
    } catch (e: any) {
      toast.error(`上傳失敗：${e.message ?? e}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-4 rounded-lg border bg-card p-4 md:flex-row md:items-start"
    >
      <button
        type="button"
        className="mt-1 cursor-grab text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
        aria-label="拖曳排序"
      >
        <GripVertical className="h-5 w-5" />
      </button>

      <div className="flex h-20 w-40 shrink-0 items-center justify-center rounded-md border bg-muted/30 p-2">
        {partner.logo_url ? (
          <img src={partner.logo_url} alt={partner.name} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">尚未上傳</span>
        )}
      </div>

      <div className="grid flex-1 gap-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="grid gap-1.5">
            <Label>名稱</Label>
            <Input value={partner.name} onChange={(e) => onChange({ name: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>標註文字（可留空）</Label>
            <Input
              value={partner.label ?? ""}
              placeholder="例如：技術合作"
              onChange={(e) => onChange({ label: e.target.value || null })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>連結網址（可留空）</Label>
            <Input
              value={partner.link_url ?? ""}
              placeholder="https://"
              onChange={(e) => onChange({ link_url: e.target.value || null })}
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label>顯示位置</Label>
          <div className="flex flex-wrap gap-4">
            {BRAND_PARTNER_SCOPES.map((s) => (
              <label key={s.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={partner.scopes.includes(s.value)}
                  onCheckedChange={(v) => toggleScope(s.value, v === true)}
                />
                <span className={s.value === "portal" ? "font-medium text-primary" : ""}>{s.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            「訂房前台」為對外頁面，勾選後所有旅客都看得到。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="file"
              accept="image/png,image/webp,image/svg+xml"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
            />
            <span className="inline-flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-accent">
              <Upload className="h-4 w-4" />
              {uploading ? "處理中…" : "上傳 Logo"}
            </span>
          </label>
          <div className="flex items-center gap-2 text-sm">
            <Switch
              checked={partner.is_active}
              onCheckedChange={(v) => onChange({ is_active: v })}
            />
            <span>{partner.is_active ? "啟用中" : "已停用"}</span>
          </div>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
            <Trash2 className="mr-1 h-4 w-4" />
            刪除
          </Button>
        </div>
      </div>

      <AlertDialog open={portalConfirm} onOpenChange={setPortalConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>要顯示到訂房前台嗎？</AlertDialogTitle>
            <AlertDialogDescription>
              勾選後「{partner.name}」的 logo 會出現在對外的訂房頁面頁尾，所有旅客都看得到。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onChange({ scopes: [...new Set([...partner.scopes, "portal"])] })}
            >
              確認顯示
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function HQBrandPartners() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading } = useAllBrandPartners();
  const [rows, setRows] = useState<BrandPartner[]>([]);
  const [saving, setSaving] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (data) setRows(data);
  }, [data]);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) return setIsSuperAdmin(false);
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      setIsSuperAdmin((roles ?? []).some((r: { role: string }) => r.role === "super_admin"));
    })();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setRows((prev) => {
      const oldIndex = prev.findIndex((r) => r.id === active.id);
      const newIndex = prev.findIndex((r) => r.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const addPartner = async () => {
    const { data: inserted, error } = await supabase
      .from("platform_brand_partners")
      .insert({
        name: "新夥伴",
        logo_url: "",
        scopes: ["admin", "team", "hq"],
        sort_order: rows.length,
      })
      .select()
      .single();
    if (error) return toast.error(`新增失敗：${error.message}`);
    setRows((prev) => [...prev, inserted as BrandPartner]);
  };

  const deletePartner = async (id: string) => {
    const { error } = await supabase.from("platform_brand_partners").delete().eq("id", id);
    if (error) return toast.error(`刪除失敗：${error.message}`);
    setRows((prev) => prev.filter((r) => r.id !== id));
    queryClient.invalidateQueries({ queryKey: ["brand-partners"] });
    toast.success("已刪除");
  };

  const save = async () => {
    setSaving(true);
    try {
      for (const [i, r] of rows.entries()) {
        const { error } = await supabase
          .from("platform_brand_partners")
          .update({
            name: r.name,
            logo_url: r.logo_url,
            label: r.label,
            link_url: r.link_url,
            scopes: r.scopes,
            is_active: r.is_active,
            sort_order: i,
          })
          .eq("id", r.id);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["brand-partners"] });
      toast.success("已儲存");
    } catch (e: any) {
      toast.error(`儲存失敗：${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  if (isSuperAdmin === false) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>權限不足</CardTitle>
            <CardDescription>品牌夥伴設定僅限最高管理員操作。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/hq")} aria-label="返回">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">品牌夥伴</h1>
            <p className="text-sm text-muted-foreground">
              一處維護，同步顯示於民宿後台、行銷團隊、總部與訂房前台。
            </p>
          </div>
        </div>
      </div>


      <Card>
        <CardHeader>
          <CardTitle className="text-base">即時預覽</CardTitle>
          <CardDescription>
            上排為內部系統樣式（民宿後台／行銷團隊／總部），下排為訂房前台頁尾樣式。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border p-4">
            <p className="mb-2 text-xs text-muted-foreground">民宿後台</p>
            <BrandLogoBar scope="admin" />
          </div>
          <div className="rounded-md border p-4">
            <p className="mb-2 text-xs text-muted-foreground">行銷團隊</p>
            <BrandLogoBar scope="team" label="行銷團隊" />
          </div>
          <div className="rounded-md border p-4">
            <p className="mb-2 text-xs text-muted-foreground">總部</p>
            <BrandLogoBar scope="hq" label="總部" />
          </div>
          <div className="rounded-md border p-4">
            <p className="mb-2 text-xs text-muted-foreground">訂房前台頁尾</p>
            <BrandLogoBar scope="portal" hideMainLogo showPartnerLabels partnerLogoClassName="h-6 sm:h-7" />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {isLoading ? null : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚無品牌夥伴，點下方「新增夥伴」開始。</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              {rows.map((r) => (
                <PartnerRow
                  key={r.id}
                  partner={r}
                  onChange={(patch) =>
                    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))
                  }
                  onDelete={() => deletePartner(r.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={addPartner}>
          <Plus className="mr-1 h-4 w-4" />
          新增夥伴
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "儲存中…" : "儲存"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        建議上傳去背 PNG／WebP，2MB 以內；系統會自動等比縮放（不裁切）並補上透明邊，確保多張 logo 並排時大小一致。
      </p>

    </div>
  );
}
