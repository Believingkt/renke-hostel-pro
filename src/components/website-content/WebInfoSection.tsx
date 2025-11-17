import { useState } from "react";
import { Upload, Info, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WebInfoSectionProps {
  accommodationId: string;
  name: string;
  heroMainTitle: string;
  heroSubtitle: string;
  heroDescription: string;
  heroPhotos: any[];
  onUpdate: () => void;
  onHeroPhotoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteHeroPhoto: (photoId: string) => void;
  uploadingHeroPhoto: boolean;
}

export const WebInfoSection = ({ 
  accommodationId, 
  name, 
  heroMainTitle, 
  heroSubtitle,
  heroDescription,
  heroPhotos, 
  onUpdate,
  onHeroPhotoUpload,
  onDeleteHeroPhoto,
  uploadingHeroPhoto
}: WebInfoSectionProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const [browserTitle, setBrowserTitle] = useState(name);
  const [mainTitle, setMainTitle] = useState(heroMainTitle);
  const [subtitle, setSubtitle] = useState(heroSubtitle);
  const [description, setDescription] = useState(heroDescription);

  const handleSave = async () => {
    if (!accommodationId) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("accommodation_info")
        .update({ 
          name: browserTitle,
          hero_main_title: mainTitle,
          hero_subtitle: subtitle,
          hero_description: description
        })
        .eq("id", accommodationId);

      if (error) throw error;

      // 更新瀏覽器標題
      if (browserTitle) {
        document.title = browserTitle;
      }

      toast.success('網頁資訊已儲存');
      onUpdate();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error saving web info:", error);
      }
      toast.error('儲存失敗，請稍後再試');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>網頁資訊</CardTitle>
        <CardDescription>設定網站的基本顯示資訊</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 瀏覽器標題名稱 */}
        <div className="space-y-2">
          <Label htmlFor="browser-title">
            瀏覽器標題名稱 <span className="text-destructive">*</span>
          </Label>
          <Input
            id="browser-title"
            value={browserTitle}
            onChange={(e) => setBrowserTitle(e.target.value)}
            placeholder="例如：山林秘境民宿"
            required
            className={browserTitle.length > 70 ? "border-yellow-500 focus-visible:ring-yellow-500" : ""}
          />
          <div className="flex items-center justify-between text-sm">
            <p className={browserTitle.length > 70 ? "text-yellow-600" : "text-muted-foreground"}>
              顯示在瀏覽器標籤頁上的標題（建議 70 字元以內）
            </p>
            <span className={browserTitle.length > 70 ? "text-yellow-600 font-medium" : "text-muted-foreground"}>
              {browserTitle.length}/70
            </span>
          </div>
          {browserTitle.length > 70 && (
            <p className="text-sm text-yellow-600 flex items-center gap-1">
              <Info className="w-4 h-4" />
              標題過長可能會在瀏覽器標籤中被截斷
            </p>
          )}
        </div>

        {/* 首頁主視覺輪播圖 */}
        <div className="space-y-4">
          <Label>首頁主視覺輪播圖</Label>
          
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => document.getElementById('hero-photo-upload')?.click()}
              disabled={uploadingHeroPhoto || heroPhotos.length >= 10}
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              {uploadingHeroPhoto ? "上傳中..." : "上傳輪播圖"}
            </Button>
            <input
              id="hero-photo-upload"
              type="file"
              accept="image/*"
              onChange={onHeroPhotoUpload}
              className="hidden"
            />
            <span className="text-sm text-muted-foreground">
              已上傳 {heroPhotos.length}/10 張
            </span>
          </div>
          
          <p className="text-sm text-muted-foreground">
            建議尺寸：1920x1080 像素，支援 JPG、PNG 格式，上傳後自動優化為 WebP
          </p>

          {/* 輪播圖列表 */}
          {heroPhotos.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
              {heroPhotos
                .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
                .map((photo) => (
                  <div key={photo.id} className="relative group">
                    <div className="aspect-video rounded-lg overflow-hidden border">
                      <img
                        src={photo.photo_url}
                        alt="輪播圖"
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                      onClick={() => onDeleteHeroPhoto(photo.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    {photo.title && (
                      <div className="absolute bottom-2 left-2 right-2 bg-black/60 text-white text-xs p-2 rounded">
                        {photo.title}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* 輪播圖主標題文字 */}
        <div className="space-y-2">
          <Label htmlFor="hero-main-title">輪播圖主標題</Label>
          <Input
            id="hero-main-title"
            value={mainTitle}
            onChange={(e) => setMainTitle(e.target.value)}
            placeholder="例如：山間的寧靜時光"
          />
          <p className="text-sm text-muted-foreground">
            顯示在首頁輪播圖的主標題文字
          </p>
        </div>

        {/* 輪播圖副標題文字 */}
        <div className="space-y-2">
          <Label htmlFor="hero-subtitle">輪播圖副標題</Label>
          <Input
            id="hero-subtitle"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="例如：體驗日式美學與自然的完美融合"
          />
          <p className="text-sm text-muted-foreground">
            顯示在首頁輪播圖的副標題文字
          </p>
        </div>

        {/* 輪播圖說明文字 */}
        <div className="space-y-2">
          <Label htmlFor="hero-description">輪播圖說明文字</Label>
          <Input
            id="hero-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="例如：坐落於山林間的日式豪華住宿"
          />
          <p className="text-sm text-muted-foreground">
            顯示在首頁輪播圖的說明文字
          </p>
        </div>

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "儲存中..." : "儲存變更"}
        </Button>
      </CardContent>
    </Card>
  );
};
