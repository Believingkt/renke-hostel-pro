import { useState, useEffect } from "react";
import { Upload, Trash2, Info, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SaveButtonContainer } from "@/components/ui/save-button-container";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { socialSharingSchema } from "@/utils/websiteValidation";

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
  const [title, setTitle] = useState(ogTitle);
  const [description, setDescription] = useState(ogDescription);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 同步 props 到 state
  useEffect(() => {
    setTitle(ogTitle);
  }, [ogTitle]);

  useEffect(() => {
    setDescription(ogDescription);
  }, [ogDescription]);

  const handleSave = async () => {
    if (!accommodationId) return;

    // 完整表單驗證
    const validationResult = socialSharingSchema.safeParse({
      ogTitle: title,
      ogDescription: description,
    });

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
          og_title: title,
          og_description: description,
        })
        .eq("id", accommodationId);

      if (error) throw error;

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
      <CardHeader>
        <CardTitle>社群分享</CardTitle>
        <CardDescription>
          設定社群分享預覽
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 社群媒體分享標題 */}
        <div className="space-y-2">
          <Label htmlFor="og-title">社群媒體分享標題</Label>
          <Input
            id="og-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：山林秘境民宿 - 享受自然寧靜時光"
            className={errors.ogTitle ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          {errors.ogTitle && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {errors.ogTitle}
            </p>
          )}
          <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">
              建議 60 字元內
            </p>
            <span className={title.length > 60 ? "text-yellow-600 font-medium" : "text-muted-foreground"}>
              {title.length}/60
            </span>
          </div>
          {title.length > 60 && (
            <p className="text-sm text-yellow-600 flex items-center gap-1">
              <Info className="w-4 h-4" />
              標題過長可能會在社群平台被截斷
            </p>
          )}
        </div>

        {/* 社群媒體分享描述 */}
        <div className="space-y-2">
          <Label htmlFor="og-description">社群媒體分享描述</Label>
          <Textarea
            id="og-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="例如：坐落於山林間的日式豪華民宿，提供私人溫泉、精緻餐飲服務..."
            rows={3}
            className={errors.ogDescription ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          {errors.ogDescription && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {errors.ogDescription}
            </p>
          )}
          <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">
              建議 160 字元內
            </p>
            <span className={description.length > 160 ? "text-yellow-600 font-medium" : "text-muted-foreground"}>
              {description.length}/160
            </span>
          </div>
          {description.length > 160 && (
            <p className="text-sm text-yellow-600 flex items-center gap-1">
              <Info className="w-4 h-4" />
              描述過長可能會在社群平台被截斷
            </p>
          )}
        </div>

        {/* 社群分享縮圖 */}
        <div className="space-y-2">
          <Label>社群分享預覽圖 (OG Image)</Label>
          <p className="text-xs text-muted-foreground">
            建議尺寸：1200x630 像素
          </p>
          <div className="flex items-start gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => document.getElementById('og-image-upload')?.click()}
              disabled={uploadingOgImage}
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              {uploadingOgImage ? "上傳中..." : "上傳縮圖"}
            </Button>
            <input
              id="og-image-upload"
              type="file"
              accept="image/*"
              onChange={onOgImageUpload}
              className="hidden"
            />
            {ogImageUrl && (
              <div className="flex items-center gap-2">
                <div className="relative w-48 h-24 border rounded overflow-hidden">
                  <img 
                    src={ogImageUrl} 
                    alt="社群分享縮圖" 
                    className="w-full h-full object-cover"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={onDeleteOgImage}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        <SaveButtonContainer onSave={handleSave} isSaving={isSaving} />
      </CardContent>
    </Card>
  );
};
