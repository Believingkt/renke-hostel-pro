import { useState, useEffect } from "react";
import { Upload, Trash2, Info, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SaveButtonContainer } from "@/components/ui/save-button-container";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { headerFooterSchema, validateField } from "@/utils/websiteValidation";

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
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 同步 props 到 state
  useEffect(() => {
    setBrowserTitle(name);
  }, [name]);

  useEffect(() => {
    setFormData({
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
  }, [address, phone, email, lineId, facebookUrl, instagramUrl, threadsUrl, youtubeUrl, tiktokUrl]);

  // 驗證單個欄位
  const validateSingleField = (field: string, value: string) => {
    const fieldSchema = headerFooterSchema.shape[field as keyof typeof headerFooterSchema.shape];
    if (fieldSchema) {
      const result = validateField(fieldSchema, value);
      setErrors(prev => ({
        ...prev,
        [field]: result.error || ''
      }));
      return result.success;
    }
    return true;
  };

  const handleSave = async () => {
    if (!accommodationId) return;

    // 完整表單驗證
    const validationResult = headerFooterSchema.safeParse({
      browserTitle,
      ...formData
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

      toast.success('網頁資訊已儲存');
      setErrors({});
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
        <CardDescription>
          設定網站頂部和底部的視覺元素與聯絡資訊
        </CardDescription>
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
            onChange={(e) => {
              setBrowserTitle(e.target.value);
              validateSingleField('browserTitle', e.target.value);
            }}
            onBlur={() => validateSingleField('browserTitle', browserTitle)}
            placeholder="例如：山林秘境民宿"
            required
            className={errors.browserTitle ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          {errors.browserTitle && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {errors.browserTitle}
            </p>
          )}
          <div className="flex items-center justify-between text-sm">
            <p className="text-muted-foreground">
              瀏覽器分頁標題（建議 70 字元內）
            </p>
            <span className={browserTitle.length > 70 ? "text-yellow-600 font-medium" : "text-muted-foreground"}>
              {browserTitle.length}/70
            </span>
          </div>
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
          <p className="text-xs text-muted-foreground">
            建議尺寸：200x60 像素
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
          <p className="text-xs text-muted-foreground">
            建議尺寸：200x60 像素
          </p>
        </div>

        {/* 聯絡資訊 */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium">聯絡資訊</h3>
            <p className="text-xs text-muted-foreground mt-1">
              聯絡資訊
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="address">地址</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, address: e.target.value }));
                validateSingleField('address', e.target.value);
              }}
              onBlur={() => validateSingleField('address', formData.address)}
              placeholder="例如：台北市信義區市府路1號"
              className={errors.address ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {errors.address && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.address}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">電話</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, phone: e.target.value }));
                validateSingleField('phone', e.target.value);
              }}
              onBlur={() => validateSingleField('phone', formData.phone)}
              placeholder="例如：02-1234-5678 或 0912-345-678"
              className={errors.phone ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {errors.phone && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.phone}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, email: e.target.value }));
                validateSingleField('email', e.target.value);
              }}
              onBlur={() => validateSingleField('email', formData.email)}
              placeholder="例如：info@example.com"
              className={errors.email ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {errors.email && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.email}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              接收訂房通知和客戶諮詢的電子郵件地址
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="line-id">LINE ID</Label>
            <Input
              id="line-id"
              value={formData.lineId}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, lineId: e.target.value }));
                validateSingleField('lineId', e.target.value);
              }}
              onBlur={() => validateSingleField('lineId', formData.lineId)}
              placeholder="例如：@example"
              className={errors.lineId ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {errors.lineId && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.lineId}
              </p>
            )}
          </div>
        </div>

        {/* 社群媒體連結 */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium">社群媒體連結</h3>
            <p className="text-xs text-muted-foreground mt-1">
              填寫完整網址
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="facebook">Facebook</Label>
            <Input
              id="facebook"
              value={formData.facebookUrl}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, facebookUrl: e.target.value }));
                validateSingleField('facebookUrl', e.target.value);
              }}
              onBlur={() => validateSingleField('facebookUrl', formData.facebookUrl)}
              placeholder="https://facebook.com/yourpage"
              className={errors.facebookUrl ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {errors.facebookUrl && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.facebookUrl}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="instagram">Instagram</Label>
            <Input
              id="instagram"
              value={formData.instagramUrl}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, instagramUrl: e.target.value }));
                validateSingleField('instagramUrl', e.target.value);
              }}
              onBlur={() => validateSingleField('instagramUrl', formData.instagramUrl)}
              placeholder="https://instagram.com/yourprofile"
              className={errors.instagramUrl ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {errors.instagramUrl && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.instagramUrl}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="threads">Threads</Label>
            <Input
              id="threads"
              value={formData.threadsUrl}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, threadsUrl: e.target.value }));
                validateSingleField('threadsUrl', e.target.value);
              }}
              onBlur={() => validateSingleField('threadsUrl', formData.threadsUrl)}
              placeholder="https://threads.net/@yourprofile"
              className={errors.threadsUrl ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {errors.threadsUrl && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.threadsUrl}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="youtube">YouTube</Label>
            <Input
              id="youtube"
              value={formData.youtubeUrl}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, youtubeUrl: e.target.value }));
                validateSingleField('youtubeUrl', e.target.value);
              }}
              onBlur={() => validateSingleField('youtubeUrl', formData.youtubeUrl)}
              placeholder="https://youtube.com/yourchannel"
              className={errors.youtubeUrl ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {errors.youtubeUrl && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.youtubeUrl}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tiktok">TikTok</Label>
            <Input
              id="tiktok"
              value={formData.tiktokUrl}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, tiktokUrl: e.target.value }));
                validateSingleField('tiktokUrl', e.target.value);
              }}
              onBlur={() => validateSingleField('tiktokUrl', formData.tiktokUrl)}
              placeholder="https://tiktok.com/@yourprofile"
              className={errors.tiktokUrl ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {errors.tiktokUrl && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.tiktokUrl}
              </p>
            )}
          </div>
        </div>

        <SaveButtonContainer onSave={handleSave} isSaving={isSaving} />
      </CardContent>
    </Card>
  );
};
