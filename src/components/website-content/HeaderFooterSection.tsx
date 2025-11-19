import { useState, useEffect } from "react";
import { Upload, Trash2, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SaveButtonContainer } from "@/components/ui/save-button-container";
import { ValidatedInput } from "@/components/ui/validated-input";
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
        <ValidatedInput
          id="browser-title"
          label="瀏覽器標題名稱"
          value={browserTitle}
          error={errors.browserTitle}
          placeholder="例如：山林秘境民宿"
          required
          maxLength={70}
          showCharCount
          onChange={(value) => {
            setBrowserTitle(value);
          }}
          onValidate={(value) => validateSingleField('browserTitle', value)}
        />

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
                <div className="relative w-32 h-16 border rounded overflow-hidden bg-muted">
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
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Info className="h-3 w-3" />
              這些資訊將顯示在網站頁尾和聯絡頁面
            </p>
          </div>
          
          <ValidatedInput
            id="address"
            label="地址"
            value={formData.address}
            error={errors.address}
            placeholder="例如：台北市信義區市府路1號"
            onChange={(value) => setFormData(prev => ({ ...prev, address: value }))}
            onValidate={(value) => validateSingleField('address', value)}
          />

          <ValidatedInput
            id="phone"
            label="電話"
            value={formData.phone}
            error={errors.phone}
            placeholder="例如：02-1234-5678 或 0912-345-678"
            onChange={(value) => setFormData(prev => ({ ...prev, phone: value }))}
            onValidate={(value) => validateSingleField('phone', value)}
          />

          <ValidatedInput
            id="email"
            label="Email"
            type="email"
            value={formData.email}
            error={errors.email}
            placeholder="例如：info@example.com"
            onChange={(value) => setFormData(prev => ({ ...prev, email: value }))}
            onValidate={(value) => validateSingleField('email', value)}
          />

          <ValidatedInput
            id="line-id"
            label="LINE ID"
            value={formData.lineId}
            error={errors.lineId}
            placeholder="例如：@example"
            onChange={(value) => setFormData(prev => ({ ...prev, lineId: value }))}
            onValidate={(value) => validateSingleField('lineId', value)}
          />
        </div>

        {/* 社群媒體連結 */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium">社群媒體連結</h3>
            <p className="text-xs text-muted-foreground mt-1">
              填寫完整網址
            </p>
          </div>

          <ValidatedInput
            id="facebook-url"
            label="Facebook"
            value={formData.facebookUrl}
            error={errors.facebookUrl}
            placeholder="https://www.facebook.com/yourpage"
            onChange={(value) => setFormData(prev => ({ ...prev, facebookUrl: value }))}
            onValidate={(value) => validateSingleField('facebookUrl', value)}
          />

          <ValidatedInput
            id="instagram-url"
            label="Instagram"
            value={formData.instagramUrl}
            error={errors.instagramUrl}
            placeholder="https://www.instagram.com/yourprofile"
            onChange={(value) => setFormData(prev => ({ ...prev, instagramUrl: value }))}
            onValidate={(value) => validateSingleField('instagramUrl', value)}
          />

          <ValidatedInput
            id="threads-url"
            label="Threads"
            value={formData.threadsUrl}
            error={errors.threadsUrl}
            placeholder="https://www.threads.net/@yourprofile"
            onChange={(value) => setFormData(prev => ({ ...prev, threadsUrl: value }))}
            onValidate={(value) => validateSingleField('threadsUrl', value)}
          />

          <ValidatedInput
            id="youtube-url"
            label="YouTube"
            value={formData.youtubeUrl}
            error={errors.youtubeUrl}
            placeholder="https://www.youtube.com/@yourchannel"
            onChange={(value) => setFormData(prev => ({ ...prev, youtubeUrl: value }))}
            onValidate={(value) => validateSingleField('youtubeUrl', value)}
          />

          <ValidatedInput
            id="tiktok-url"
            label="TikTok"
            value={formData.tiktokUrl}
            error={errors.tiktokUrl}
            placeholder="https://www.tiktok.com/@yourprofile"
            onChange={(value) => setFormData(prev => ({ ...prev, tiktokUrl: value }))}
            onValidate={(value) => validateSingleField('tiktokUrl', value)}
          />
        </div>

        <SaveButtonContainer 
          onSave={handleSave} 
          isSaving={isSaving}
        />
      </CardContent>
    </Card>
  );
};
