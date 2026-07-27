import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Upload, Trash2, Info, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SaveButtonContainer } from "@/components/ui/save-button-container";
import { ValidatedInput } from "@/components/ui/validated-input";
import { DraftRestoreBanner } from "@/components/ui/draft-restore-banner";
import { useFormDraft } from "@/hooks/use-form-draft";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { headerFooterSchema, validateField } from "@/utils/websiteValidation";
import { invalidateAccommodationCache } from "@/hooks/use-accommodation-cache";

const ReadOnlyRow = ({
  label,
  value,
  hint,
  onGo,
  goLabel,
}: {
  label: string;
  value?: string;
  hint: string;
  onGo: () => void;
  goLabel: string;
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3">
    <div className="sm:w-24 shrink-0 text-sm font-medium">{label}</div>
    <div className="flex-1 min-w-0">
      <div className="text-sm break-words">{value || <span className="text-muted-foreground">未設定</span>}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
    </div>
    <Button type="button" variant="outline" size="sm" onClick={onGo} className="shrink-0">
      {goLabel}
      <ArrowRight className="h-3.5 w-3.5 ml-1" />
    </Button>
  </div>
);


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
    key: `header-footer-draft-${accommodationId}`,
    initialData: {
      browserTitle: name,
      address,
      phone,
      email,
      lineId,
      facebookUrl,
      instagramUrl,
      threadsUrl,
      youtubeUrl,
      tiktokUrl,
    },
  });

  // 同步 props 到 state（僅在 props 改變且無草稿時）
  useEffect(() => {
    if (!hasDraft) {
      setFormData({
        browserTitle: name,
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
    }
  }, [name, address, phone, email, lineId, facebookUrl, instagramUrl, threadsUrl, youtubeUrl, tiktokUrl, hasDraft]);

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
    const validationResult = headerFooterSchema.safeParse(formData);

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
          name: formData.browserTitle,
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
      if (formData.browserTitle) {
        document.title = formData.browserTitle;
      }

      // 清除草稿
      clearDraft();

      // 清除前台快取
      invalidateAccommodationCache(accommodationId);
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
      {hasDraft && (
        <div className="p-6 pb-0">
          <DraftRestoreBanner onRestore={restoreDraft} onDiscard={discardDraft} />
        </div>
      )}
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-1.5 bg-primary rounded-full" />
          <div>
            <CardTitle className="text-xl">網頁資訊</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">設定網站頂部和底部的視覺元素與聯絡資訊</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 瀏覽器標題名稱 */}
        <ValidatedInput
          id="browser-title"
          label="瀏覽器標題名稱"
          value={formData.browserTitle}
          error={errors.browserTitle}
          placeholder="例如：山林秘境民宿"
          required
          maxLength={70}
          showCharCount
          onChange={(value) => {
            setFormData({ browserTitle: value });
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
              className="flex items-center gap-2 h-11 sm:h-10 touch-manipulation"
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
                  variant="ghost-destructive"
                  size="icon"
                  onClick={() => onDeleteLogo('header')}
                  className="h-11 w-11 sm:h-10 sm:w-10 touch-manipulation"
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
              className="flex items-center gap-2 h-11 sm:h-10 touch-manipulation"
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
                  variant="ghost-destructive"
                  size="icon"
                  onClick={() => onDeleteLogo('footer')}
                  className="h-11 w-11 sm:h-10 sm:w-10 touch-manipulation"
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

        {/* 聯絡資訊（唯讀，於其他分頁維護） */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium">聯絡資訊</h3>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Info className="h-3 w-3" />
              這些欄位由其他分頁維護，此處僅供檢視，避免重複儲存互相覆蓋
            </p>
          </div>

          <div className="rounded-lg border divide-y">
            <ReadOnlyRow
              label="地址"
              value={address}
              hint="於「交通地圖」分頁維護"
              onGo={() => goToTab('location')}
              goLabel="前往交通地圖"
            />
            <ReadOnlyRow
              label="電話"
              value={phone}
              hint="於「訂房確認通知」分頁維護"
              onGo={() => goToTab('email-notification')}
              goLabel="前往訂房確認通知"
            />
            <ReadOnlyRow
              label="Email"
              value={email}
              hint="於「訂房確認通知」分頁維護"
              onGo={() => goToTab('email-notification')}
              goLabel="前往訂房確認通知"
            />
            <ReadOnlyRow
              label="LINE ID"
              value={lineId}
              hint="於「訂房確認通知」分頁維護"
              onGo={() => goToTab('email-notification')}
              goLabel="前往訂房確認通知"
            />
          </div>
        </div>

        {/* 社群媒體連結 */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium">社群媒體連結</h3>
            <p className="text-xs text-muted-foreground mt-1">
              填寫完整網址，會顯示在訂房頁頁尾
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
