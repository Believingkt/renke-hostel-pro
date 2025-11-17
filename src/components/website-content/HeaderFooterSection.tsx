import { useState } from "react";
import { Upload, Trash2, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface HeaderFooterSectionProps {
  accommodationId: string;
  name: string;
  headerLogoUrl: string;
  footerLogoUrl: string;
  address: string;
  phone: string;
  email: string;
  lineId: string;
  facebookUrl: string;
  instagramUrl: string;
  threadsUrl: string;
  youtubeUrl: string;
  tiktokUrl: string;
  onUpdate: () => void;
  onLogoUpload: (event: React.ChangeEvent<HTMLInputElement>, type: 'header' | 'footer') => void;
  onDeleteLogo: (type: 'header' | 'footer') => void;
  uploadingHeaderLogo: boolean;
  uploadingFooterLogo: boolean;
}

export const HeaderFooterSection = ({
  accommodationId,
  name,
  headerLogoUrl,
  footerLogoUrl,
  address,
  phone,
  email,
  lineId,
  facebookUrl,
  instagramUrl,
  threadsUrl,
  youtubeUrl,
  tiktokUrl,
  onUpdate,
  onLogoUpload,
  onDeleteLogo,
  uploadingHeaderLogo,
  uploadingFooterLogo,
}: HeaderFooterSectionProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const [browserTitle, setBrowserTitle] = useState(name);
  const [formData, setFormData] = useState({
    address,
    phone,
    email,
    lineId,
    facebookUrl,
    instagramUrl,
    threadsUrl,
    youtubeUrl,
    tiktokUrl,
  });

  const handleSave = async () => {
    if (!accommodationId || !browserTitle.trim()) {
      toast.error('請填寫瀏覽器標題名稱');
      return;
    }
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("accommodation_info")
        .update({
          name: browserTitle,
          address: formData.address,
          phone: formData.phone,
          email: formData.email,
          line_id: formData.lineId,
          facebook_url: formData.facebookUrl,
          instagram_url: formData.instagramUrl,
          threads_url: formData.threadsUrl,
          youtube_url: formData.youtubeUrl,
          tiktok_url: formData.tiktokUrl,
        })
        .eq("id", accommodationId);

      if (error) throw error;

      // 更新瀏覽器標題
      if (browserTitle) {
        document.title = browserTitle;
      }

      toast.success('頁首/頁尾資訊已儲存');
      onUpdate();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error saving header/footer:", error);
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
        <CardDescription>設定網站頁首和頁尾顯示的資訊</CardDescription>
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

        {/* 頁首 Logo */}
        <div className="space-y-2">
          <Label>頁首 Logo</Label>
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => document.getElementById('header-logo-upload')?.click()}
              disabled={uploadingHeaderLogo}
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              {uploadingHeaderLogo ? "上傳中..." : "上傳頁首 Logo"}
            </Button>
            <input
              id="header-logo-upload"
              type="file"
              accept="image/*"
              onChange={(e) => onLogoUpload(e, 'header')}
              className="hidden"
            />
            {headerLogoUrl && (
              <div className="flex items-center gap-2">
                <div className="relative w-32 h-16 border rounded overflow-hidden">
                  <img 
                    src={headerLogoUrl} 
                    alt="頁首 Logo" 
                    className="w-full h-full object-contain"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => onDeleteLogo('header')}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            建議尺寸：200x60 像素，支援 PNG、JPG 格式（透明背景請使用 PNG）
          </p>
        </div>

        {/* 頁尾 Logo */}
        <div className="space-y-2">
          <Label>頁尾 Logo</Label>
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => document.getElementById('footer-logo-upload')?.click()}
              disabled={uploadingFooterLogo}
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              {uploadingFooterLogo ? "上傳中..." : "上傳頁尾 Logo"}
            </Button>
            <input
              id="footer-logo-upload"
              type="file"
              accept="image/*"
              onChange={(e) => onLogoUpload(e, 'footer')}
              className="hidden"
            />
            {footerLogoUrl && (
              <div className="flex items-center gap-2">
                <div className="relative w-32 h-16 border rounded overflow-hidden">
                  <img 
                    src={footerLogoUrl} 
                    alt="頁尾 Logo" 
                    className="w-full h-full object-contain"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => onDeleteLogo('footer')}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            建議尺寸：200x60 像素，支援 PNG、JPG 格式（透明背景請使用 PNG）
          </p>
        </div>

        {/* 聯絡資訊 */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">聯絡資訊</h3>
          
          <div className="space-y-2">
            <Label htmlFor="address">地址</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
              placeholder="例如：台北市信義區市府路1號"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">電話</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="例如：02-1234-5678"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="例如：info@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="line-id">LINE ID</Label>
            <Input
              id="line-id"
              value={formData.lineId}
              onChange={(e) => setFormData(prev => ({ ...prev, lineId: e.target.value }))}
              placeholder="例如：@example"
            />
          </div>
        </div>

        {/* 社群媒體連結 */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">社群媒體連結</h3>
          
          <div className="space-y-2">
            <Label htmlFor="facebook">Facebook</Label>
            <Input
              id="facebook"
              value={formData.facebookUrl}
              onChange={(e) => setFormData(prev => ({ ...prev, facebookUrl: e.target.value }))}
              placeholder="https://facebook.com/yourpage"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="instagram">Instagram</Label>
            <Input
              id="instagram"
              value={formData.instagramUrl}
              onChange={(e) => setFormData(prev => ({ ...prev, instagramUrl: e.target.value }))}
              placeholder="https://instagram.com/yourprofile"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="threads">Threads</Label>
            <Input
              id="threads"
              value={formData.threadsUrl}
              onChange={(e) => setFormData(prev => ({ ...prev, threadsUrl: e.target.value }))}
              placeholder="https://threads.net/@yourprofile"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="youtube">YouTube</Label>
            <Input
              id="youtube"
              value={formData.youtubeUrl}
              onChange={(e) => setFormData(prev => ({ ...prev, youtubeUrl: e.target.value }))}
              placeholder="https://youtube.com/@yourchannel"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tiktok">TikTok</Label>
            <Input
              id="tiktok"
              value={formData.tiktokUrl}
              onChange={(e) => setFormData(prev => ({ ...prev, tiktokUrl: e.target.value }))}
              placeholder="https://tiktok.com/@yourprofile"
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "儲存中..." : "儲存變更"}
        </Button>
      </CardContent>
    </Card>
  );
};
