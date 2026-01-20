import { useState, useEffect } from "react";
import { Upload, Trash2, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SaveButtonContainer } from "@/components/ui/save-button-container";
import { ValidatedInput } from "@/components/ui/validated-input";
import { ValidatedTextarea } from "@/components/ui/validated-textarea";
import { DraftRestoreBanner } from "@/components/ui/draft-restore-banner";
import { useFormDraft } from "@/hooks/use-form-draft";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { socialSharingSchema } from "@/utils/websiteValidation";
import { invalidateAccommodationCache } from "@/hooks/use-accommodation-cache";

interface SocialSharingSectionProps {
  accommodationId: string;
  ogTitle: string;
  ogDescription: string;
  ogImageUrl: string;
  onUpdate: () => void;
  onOgImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteOgImage: () => void;
  uploadingOgImage: boolean;
}

export const SocialSharingSection = ({
  accommodationId,
  ogTitle,
  ogDescription,
  ogImageUrl,
  onUpdate,
  onOgImageUpload,
  onDeleteOgImage,
  uploadingOgImage,
}: SocialSharingSectionProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 使用草稿功能
  const {
    formData,
    setFormData,
    hasDraft,
    restoreDraft,
    discardDraft,
    clearDraft,
  } = useFormDraft({
    key: `social-sharing-draft-${accommodationId}`,
    initialData: {
      ogTitle,
      ogDescription,
    },
  });

  // 同步 props 到 state（僅在 props 改變且無草稿時）
  useEffect(() => {
    if (!hasDraft) {
      setFormData({
        ogTitle,
        ogDescription,
      });
    }
  }, [ogTitle, ogDescription, hasDraft]);

  const validateField = (field: string, value: string) => {
    try {
      socialSharingSchema.shape[field as keyof typeof socialSharingSchema.shape].parse(value);
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    } catch (error: any) {
      if (error.errors?.[0]) {
        setErrors(prev => ({ ...prev, [field]: error.errors[0].message }));
      }
    }
  };

  const handleSave = async () => {
    if (!accommodationId) return;

    // 完整表單驗證
    const validationResult = socialSharingSchema.safeParse(formData);

    if (!validationResult.success) {
      const newErrors: Record<string, string> = {};
      validationResult.error.errors.forEach((err) => {
        if (err.path[0]) {
          newErrors[err.path[0].toString()] = err.message;
        }
      });
      setErrors(newErrors);
      toast.error('請修正表單錯誤後再試');
      return;
    }
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("accommodation_info")
        .update({
          og_title: formData.ogTitle,
          og_description: formData.ogDescription,
        })
        .eq("id", accommodationId);

      if (error) throw error;

      // 清除草稿
      clearDraft();

      // 清除前台快取
      invalidateAccommodationCache(accommodationId);
      toast.success('社群分享資訊已儲存');
      setErrors({});
      onUpdate();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error saving social sharing:", error);
      }
      toast.error('儲存失敗，請稍後再試');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      {hasDraft && (
        <div className="p-6 pb-0">
          <DraftRestoreBanner onRestore={restoreDraft} onDiscard={discardDraft} />
        </div>
      )}
      <CardHeader>
        <CardTitle>社群分享</CardTitle>
        <CardDescription>
          設定社群分享預覽
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 社群媒體分享標題 */}
        <div className="space-y-2">
          <ValidatedInput
            id="og-title"
            label="社群媒體分享標題"
            value={formData.ogTitle}
            onChange={(value) => setFormData({ ogTitle: value })}
            onValidate={(value) => validateField('ogTitle', value)}
            error={errors.ogTitle}
            placeholder="例如：山林秘境民宿 - 享受自然寧靜時光"
            showCharCount
            maxLength={60}
          />
          <p className="text-xs text-muted-foreground">
            建議 60 字元內
          </p>
          {formData.ogTitle && formData.ogTitle.length > 60 && (
            <p className="text-sm text-yellow-600 flex items-center gap-1">
              <Info className="w-4 h-4" />
              標題過長可能會在社群平台被截斷
            </p>
          )}
        </div>

        {/* 社群媒體分享描述 */}
        <div className="space-y-2">
          <ValidatedTextarea
            id="og-description"
            label="社群媒體分享描述"
            value={formData.ogDescription}
            onChange={(value) => setFormData({ ogDescription: value })}
            onValidate={(value) => validateField('ogDescription', value)}
            error={errors.ogDescription}
            placeholder="例如：坐落於山林間的日式豪華民宿，提供私人溫泉、精緻餐飲服務..."
            rows={3}
            showCharCount
            maxLength={160}
          />
          <p className="text-xs text-muted-foreground">
            建議 160 字元內
          </p>
          {formData.ogDescription && formData.ogDescription.length > 160 && (
            <p className="text-sm text-yellow-600 flex items-center gap-1">
              <Info className="w-4 h-4" />
              描述過長可能會在社群平台被截斷
            </p>
          )}
        </div>

        {/* 社群分享縮圖 */}
        <div className="space-y-4">
          <div>
            <Label className="text-base font-semibold">社群分享預覽圖 (OG Image)</Label>
            <p className="text-sm text-muted-foreground mt-1">
              建議尺寸：1200x630 像素
            </p>
          </div>
          
          <div className="space-y-4">
            {/* 上傳按鈕 */}
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById('og-image-upload')?.click()}
                disabled={uploadingOgImage}
                className="w-full sm:w-auto flex items-center justify-center gap-2 h-12 sm:h-11 touch-manipulation"
              >
                <Upload className="h-5 w-5 sm:h-4 sm:w-4" />
                <span className="text-base sm:text-sm">{uploadingOgImage ? "上傳中..." : "上傳縮圖"}</span>
              </Button>
              <input
                id="og-image-upload"
                type="file"
                accept="image/*"
                onChange={onOgImageUpload}
                className="hidden"
              />
            </div>

            {/* 預覽圖區域 */}
            {ogImageUrl && (
              <div className="relative rounded-lg border-2 border-border bg-muted/30 p-4 transition-all duration-200 hover:border-primary/50">
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <div className="relative w-full sm:w-64 aspect-[1.91/1] rounded-lg overflow-hidden border border-border shadow-sm bg-background">
                    <img 
                      src={ogImageUrl} 
                      alt="社群分享縮圖預覽" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex flex-col gap-2 flex-1">
                    <p className="text-sm text-muted-foreground">
                      此圖片將在社群媒體（Facebook、Twitter、LinkedIn 等）分享時顯示
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onDeleteOgImage}
                      className="w-full sm:w-auto h-10 touch-manipulation text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      刪除圖片
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <SaveButtonContainer onSave={handleSave} isSaving={isSaving} />
      </CardContent>
    </Card>
  );
};
