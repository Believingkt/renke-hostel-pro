import { useState, useEffect } from "react";
import { Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SaveButtonContainer } from "@/components/ui/save-button-container";
import { DraftRestoreBanner } from "@/components/ui/draft-restore-banner";
import { useFormDraft } from "@/hooks/use-form-draft";
import { invalidateAccommodationCache } from "@/hooks/use-accommodation-cache";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { cn } from "@/lib/utils";

// SEO 驗證規則
const seoSchema = z.object({
  seoTitle: z.string().max(60, "標題不可超過 60 字元").optional(),
  metaDescription: z.string().max(160, "描述不可超過 160 字元").optional(),
  metaKeywords: z.string().max(200, "關鍵字不可超過 200 字元").optional(),
});

interface SeoSettingsSectionProps {
  accommodationId: string;
  seoTitle: string;
  metaDescription: string;
  metaKeywords: string;
  onUpdate: () => void;
}

export const SeoSettingsSection = ({
  accommodationId,
  seoTitle,
  metaDescription,
  metaKeywords,
  onUpdate,
}: SeoSettingsSectionProps) => {
  const {
    formData,
    setFormData,
    hasDraft,
    restoreDraft,
    discardDraft,
    clearDraft,
  } = useFormDraft({
    key: `seo-settings-${accommodationId}`,
    initialData: {
      seoTitle: seoTitle || "",
      metaDescription: metaDescription || "",
      metaKeywords: metaKeywords || "",
    },
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // 當 props 變更時同步更新（如果沒有草稿）
  useEffect(() => {
    if (!hasDraft) {
      setFormData({
        seoTitle: seoTitle || "",
        metaDescription: metaDescription || "",
        metaKeywords: metaKeywords || "",
      });
    }
  }, [seoTitle, metaDescription, metaKeywords, hasDraft, setFormData]);

  const validateField = (field: string, value: string) => {
    const fieldSchema = seoSchema.shape[field as keyof typeof seoSchema.shape];
    if (fieldSchema) {
      const result = fieldSchema.safeParse(value);
      if (!result.success) {
        setErrors((prev) => ({ ...prev, [field]: result.error.errors[0]?.message || "驗證失敗" }));
        return;
      }
    }
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  };

  const handleSave = async () => {
    // 驗證所有欄位
    const validation = seoSchema.safeParse(formData);
    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      validation.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      toast.error("請修正表單錯誤");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("accommodation_info")
        .update({
          seo_title: formData.seoTitle,
          seo_description: formData.metaDescription,
          meta_keywords: formData.metaKeywords,
        })
        .eq("id", accommodationId);

      if (error) throw error;

      clearDraft();
      invalidateAccommodationCache(accommodationId);
      toast.success("SEO 設定已儲存");
      onUpdate();
    } catch (error) {
      console.error("Error saving SEO settings:", error);
      toast.error("儲存失敗，請稍後再試");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-1.5 bg-primary rounded-full" />
          <div>
            <CardTitle className="text-xl">SEO 設定</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              設定搜尋引擎顯示的標題、描述和關鍵字
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {hasDraft && (
          <DraftRestoreBanner
            onRestore={restoreDraft}
            onDiscard={discardDraft}
          />
        )}

        {/* SEO 預覽 */}
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">
              Google 搜尋結果預覽
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-lg text-blue-600 hover:underline cursor-pointer truncate">
              {formData.seoTitle || "頁面標題"}
            </div>
            <div className="text-sm text-green-700 truncate">
              {typeof window !== "undefined" ? window.location.origin : "https://example.com"}
            </div>
            <div className="text-sm text-muted-foreground line-clamp-2">
              {formData.metaDescription || "頁面描述會顯示在這裡，建議不超過 160 字元以確保完整顯示..."}
            </div>
          </div>
        </div>

        {/* 頁面標題 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="seoTitle">頁面標題 (Title Tag)</Label>
            <span className={cn(
              "text-xs",
              formData.seoTitle.length > 55 ? "text-destructive font-medium" : "text-muted-foreground"
            )}>
              {formData.seoTitle.length}/60
            </span>
          </div>
          <Input
            id="seoTitle"
            value={formData.seoTitle}
            onChange={(e) => {
              setFormData({ ...formData, seoTitle: e.target.value });
              validateField("seoTitle", e.target.value);
            }}
            placeholder="輸入頁面標題，建議 30-60 字元"
            maxLength={60}
            className={cn(errors.seoTitle && "border-destructive")}
          />
          {errors.seoTitle && (
            <p className="text-xs text-destructive">{errors.seoTitle}</p>
          )}
          <p className="text-xs text-muted-foreground">
            這是顯示在瀏覽器標籤和搜尋結果中的標題
          </p>
        </div>

        {/* Meta 描述 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="metaDescription">Meta 描述</Label>
            <span className={cn(
              "text-xs",
              formData.metaDescription.length > 150 ? "text-destructive font-medium" : "text-muted-foreground"
            )}>
              {formData.metaDescription.length}/160
            </span>
          </div>
          <Textarea
            id="metaDescription"
            value={formData.metaDescription}
            onChange={(e) => {
              setFormData({ ...formData, metaDescription: e.target.value });
              validateField("metaDescription", e.target.value);
            }}
            placeholder="輸入頁面描述，建議 120-160 字元"
            maxLength={160}
            rows={3}
            className={cn(errors.metaDescription && "border-destructive")}
          />
          {errors.metaDescription && (
            <p className="text-xs text-destructive">{errors.metaDescription}</p>
          )}
          <p className="text-xs text-muted-foreground">
            這段描述會顯示在搜尋結果中，吸引用戶點擊
          </p>
        </div>

        {/* 關鍵字 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="metaKeywords">關鍵字</Label>
            <span className={cn(
              "text-xs",
              formData.metaKeywords.length > 180 ? "text-destructive font-medium" : "text-muted-foreground"
            )}>
              {formData.metaKeywords.length}/200
            </span>
          </div>
          <Input
            id="metaKeywords"
            value={formData.metaKeywords}
            onChange={(e) => {
              setFormData({ ...formData, metaKeywords: e.target.value });
              validateField("metaKeywords", e.target.value);
            }}
            placeholder="輸入關鍵字，以逗號分隔（例如：民宿, 住宿, 度假）"
            maxLength={200}
            className={cn(errors.metaKeywords && "border-destructive")}
          />
          {errors.metaKeywords && (
            <p className="text-xs text-destructive">{errors.metaKeywords}</p>
          )}
          <p className="text-xs text-muted-foreground">
            輸入與網站相關的關鍵字，多個關鍵字請用逗號分隔
          </p>
        </div>

        <SaveButtonContainer onSave={handleSave} isSaving={saving} />
      </CardContent>
    </Card>
  );
};
