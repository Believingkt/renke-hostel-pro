import { useState } from "react";
import { Upload, Trash2, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

  const handleSave = async () => {
    if (!accommodationId) return;
    
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
        <CardDescription>設定在社群媒體分享時顯示的資訊</CardDescription>
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
            className={title.length > 60 ? "border-yellow-500 focus-visible:ring-yellow-500" : ""}
          />
          <div className="flex items-center justify-between text-sm">
            <p className={title.length > 60 ? "text-yellow-600" : "text-muted-foreground"}>
              當網站連結在社群媒體分享時顯示的標題（建議 60 字元以內）
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
            className={description.length > 160 ? "border-yellow-500 focus-visible:ring-yellow-500" : ""}
          />
          <div className="flex items-center justify-between text-sm">
            <p className={description.length > 160 ? "text-yellow-600" : "text-muted-foreground"}>
              當網站連結在社群媒體分享時顯示的描述（建議 160 字元以內）
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
          <Label>社群分享縮圖 (OG Image)</Label>
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
          <p className="text-sm text-muted-foreground">
            建議尺寸：1200x630 像素，支援 PNG、JPG 格式。這張圖片會在社群媒體（Facebook、Twitter 等）分享連結時顯示。
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "儲存中..." : "儲存變更"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
