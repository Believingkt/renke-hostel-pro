import { useState } from "react";
import { Upload, Info } from "lucide-react";
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
  heroPhotos: any[];
  onUpdate: () => void;
}

export const WebInfoSection = ({ 
  accommodationId, 
  name, 
  heroMainTitle, 
  heroSubtitle,
  heroPhotos, 
  onUpdate 
}: WebInfoSectionProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const [browserTitle, setBrowserTitle] = useState(name);
  const [mainTitle, setMainTitle] = useState(heroMainTitle);
  const [subtitle, setSubtitle] = useState(heroSubtitle);

  const handleSave = async () => {
    if (!accommodationId) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("accommodation_info")
        .update({ 
          name: browserTitle,
          hero_main_title: mainTitle,
          hero_subtitle: subtitle
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
        <div className="space-y-2">
          <Label>首頁主視覺輪播圖</Label>
          <p className="text-sm text-muted-foreground">
            上傳的圖片將顯示在首頁頂部的輪播區域，建議尺寸：1920x1080 像素
          </p>
          <div className="text-sm text-muted-foreground mt-2">
            已上傳 {heroPhotos.length} 張圖片（在「相片管理」頁籤中管理）
          </div>
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

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "儲存中..." : "儲存變更"}
        </Button>
      </CardContent>
    </Card>
  );
};
