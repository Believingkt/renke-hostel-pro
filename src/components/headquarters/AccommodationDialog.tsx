import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Globe, CheckCircle2, XCircle, AlertCircle, Palette, Upload, Trash2, Image, Crop, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { LogoCropDialog } from "@/components/LogoCropDialog";
import { THEME_PRESET_CONFIGS, getThemeConfig } from "@/constants/themes";

// 主題預覽元件
const ThemePreview = ({ themeValue }: { themeValue: string }) => {
  const theme = getThemeConfig(themeValue);
  const { colors } = theme;

  return (
    <div 
      className="rounded-lg border overflow-hidden shadow-sm"
      style={{ backgroundColor: colors.background }}
    >
      {/* 模擬導航列 */}
      <div 
        className="h-8 flex items-center px-3 gap-2"
        style={{ backgroundColor: colors.background, borderBottom: `1px solid ${colors.card}` }}
      >
        <div 
          className="h-4 w-16 rounded"
          style={{ backgroundColor: colors.primary }}
        />
        <div className="flex-1" />
        <div className="flex gap-1.5">
          {[1, 2, 3].map(i => (
            <div 
              key={i}
              className="h-2 w-8 rounded"
              style={{ backgroundColor: colors.card }}
            />
          ))}
        </div>
      </div>

      {/* 模擬 Hero 區塊 */}
      <div 
        className="h-16 flex items-center justify-center"
        style={{ 
          background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})` 
        }}
      >
        <div className="text-center">
          <div className="h-2 w-20 rounded bg-white/90 mx-auto mb-1" />
          <div className="h-1.5 w-14 rounded bg-white/60 mx-auto" />
        </div>
      </div>

      {/* 模擬內容區塊 */}
      <div className="p-3 space-y-2" style={{ backgroundColor: colors.background }}>
        <div className="flex gap-2">
          {[1, 2].map(i => (
            <div 
              key={i}
              className="flex-1 h-10 rounded-md p-2"
              style={{ backgroundColor: colors.card }}
            >
              <div 
                className="h-1.5 w-8 rounded mb-1"
                style={{ backgroundColor: colors.primary, opacity: 0.7 }}
              />
              <div className="h-1 w-full rounded" style={{ backgroundColor: colors.primary, opacity: 0.2 }} />
            </div>
          ))}
        </div>
        <div 
          className="h-6 rounded-md flex items-center justify-center"
          style={{ backgroundColor: colors.primary }}
        >
          <div className="h-1.5 w-12 rounded bg-white/90" />
        </div>
      </div>

      {/* 模擬 Footer */}
      <div 
        className="h-6 flex items-center justify-center"
        style={{ backgroundColor: colors.footer }}
      >
        <div className="h-1 w-16 rounded bg-white/40" />
      </div>
    </div>
  );
};

interface AccommodationFormData {
  name: string;
  type: string;
  registration_number: string;
  country: string;
  region_1: string;
  region_2: string;
  address: string;
  phone: string;
  email: string;
  description: string;
  short_url_alias: string;
  theme_preset: string;
}

interface AccommodationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AccommodationFormData) => Promise<void>;
  initialData?: Partial<AccommodationFormData> & { 
    id?: string;
    header_logo_url?: string | null;
    footer_logo_url?: string | null;
  };
  isEditing?: boolean;
}

// Subdomain validation regex: lowercase letters, numbers, hyphens, 3-30 chars
const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$/;

export function AccommodationDialog({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  isEditing = false,
}: AccommodationDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [subdomainStatus, setSubdomainStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [formData, setFormData] = useState<AccommodationFormData>({
    name: "",
    type: "民宿",
    registration_number: "",
    country: "台灣",
    region_1: "",
    region_2: "",
    address: "",
    phone: "",
    email: "",
    description: "",
    short_url_alias: "",
    theme_preset: "default",
  });

  // Logo states
  const [headerLogoUrl, setHeaderLogoUrl] = useState<string | null>(null);
  const [footerLogoUrl, setFooterLogoUrl] = useState<string | null>(null);
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [uploadingFooter, setUploadingFooter] = useState(false);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const footerInputRef = useRef<HTMLInputElement>(null);

  // Crop dialog states
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string>("");
  const [cropLogoType, setCropLogoType] = useState<'header' | 'footer'>('header');

  // LINE Pay setting state
  const [linePayEnabled, setLinePayEnabled] = useState(false);
  const [loadingLinePay, setLoadingLinePay] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || "",
        type: initialData.type || "民宿",
        registration_number: initialData.registration_number || "",
        country: initialData.country || "台灣",
        region_1: initialData.region_1 || "",
        region_2: initialData.region_2 || "",
        address: initialData.address || "",
        phone: initialData.phone || "",
        email: initialData.email || "",
        description: initialData.description || "",
        short_url_alias: initialData.short_url_alias || "",
        theme_preset: (initialData as any).theme_preset || "default",
      });
      setHeaderLogoUrl(initialData.header_logo_url || null);
      setFooterLogoUrl(initialData.footer_logo_url || null);
      setSubdomainStatus("idle");
    } else {
      setFormData({
        name: "",
        type: "民宿",
        registration_number: "",
        country: "台灣",
        region_1: "",
        region_2: "",
        address: "",
        phone: "",
        email: "",
        description: "",
        short_url_alias: "",
        theme_preset: "default",
      });
      setHeaderLogoUrl(null);
      setFooterLogoUrl(null);
      setSubdomainStatus("idle");
      setLinePayEnabled(false);
    }
  }, [initialData, open]);

  // Load LINE Pay setting when editing
  useEffect(() => {
    if (isEditing && initialData?.id && open) {
      loadLinePaySetting(initialData.id);
    }
  }, [isEditing, initialData?.id, open]);

  const loadLinePaySetting = async (accommodationId: string) => {
    try {
      const { data, error } = await supabase
        .from("booking_settings")
        .select("payment_methods")
        .eq("accommodation_id", accommodationId)
        .single();

      if (error) throw error;

      const paymentMethods = Array.isArray(data?.payment_methods) ? data.payment_methods : [];
      setLinePayEnabled(paymentMethods.includes("LINE Pay"));
    } catch (error) {
      console.error("Error loading LINE Pay setting:", error);
    }
  };

  const handleLinePayToggle = async (enabled: boolean) => {
    if (!initialData?.id) return;

    setLoadingLinePay(true);
    try {
      // Get current payment methods
      const { data: currentData, error: fetchError } = await supabase
        .from("booking_settings")
        .select("payment_methods")
        .eq("accommodation_id", initialData.id)
        .single();

      if (fetchError) throw fetchError;

      let paymentMethods = Array.isArray(currentData?.payment_methods) 
        ? [...currentData.payment_methods] 
        : [];

      if (enabled) {
        // Add LINE Pay if not exists
        if (!paymentMethods.includes("LINE Pay")) {
          paymentMethods.push("LINE Pay");
        }
      } else {
        // Remove LINE Pay
        paymentMethods = paymentMethods.filter((m: string) => m !== "LINE Pay");
      }

      const { error: updateError } = await supabase
        .from("booking_settings")
        .update({ 
          payment_methods: paymentMethods,
          updated_at: new Date().toISOString()
        })
        .eq("accommodation_id", initialData.id);

      if (updateError) throw updateError;

      setLinePayEnabled(enabled);
      toast.success(enabled ? "LINE Pay 已啟用" : "LINE Pay 已停用");
    } catch (error: any) {
      console.error("Error updating LINE Pay setting:", error);
      toast.error("更新失敗", { description: error.message });
    } finally {
      setLoadingLinePay(false);
    }
  };

  // Handle file selection - open crop dialog
  const handleFileSelect = (
    event: React.ChangeEvent<HTMLInputElement>,
    type: 'header' | 'footer'
  ) => {
    const file = event.target.files?.[0];
    if (!file || !initialData?.id) return;

    // Create object URL for cropping
    const imageUrl = URL.createObjectURL(file);
    setCropImageSrc(imageUrl);
    setCropLogoType(type);
    setCropDialogOpen(true);

    // Reset input
    if (event.target) event.target.value = '';
  };

  // Handle cropped image upload
  const handleCropComplete = async (croppedBlob: Blob) => {
    if (!initialData?.id) return;

    const isHeader = cropLogoType === 'header';
    isHeader ? setUploadingHeader(true) : setUploadingFooter(true);

    try {
      // Generate unique filename
      const fileName = `${initialData.id}/${cropLogoType}-logo-${Date.now()}.png`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, croppedBlob, { 
          upsert: true,
          contentType: 'image/png'
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(fileName);

      // Update database
      const updateData = isHeader 
        ? { header_logo_url: publicUrl }
        : { footer_logo_url: publicUrl };

      const { error: updateError } = await supabase
        .from('accommodation_info')
        .update(updateData)
        .eq('id', initialData.id);

      if (updateError) throw updateError;

      // Update local state
      if (isHeader) {
        setHeaderLogoUrl(publicUrl);
      } else {
        setFooterLogoUrl(publicUrl);
      }

      toast.success(`${isHeader ? '頁首' : '頁尾'} Logo 上傳成功`);
    } catch (error: any) {
      console.error('Logo upload error:', error);
      toast.error('Logo 上傳失敗', { description: error.message });
    } finally {
      isHeader ? setUploadingHeader(false) : setUploadingFooter(false);
      // Clean up object URL
      if (cropImageSrc) {
        URL.revokeObjectURL(cropImageSrc);
        setCropImageSrc("");
      }
    }
  };

  // Logo delete handler
  const handleDeleteLogo = async (type: 'header' | 'footer') => {
    if (!initialData?.id) return;

    const isHeader = type === 'header';
    
    try {
      // Update database to remove logo URL
      const updateData = isHeader 
        ? { header_logo_url: null }
        : { footer_logo_url: null };

      const { error } = await supabase
        .from('accommodation_info')
        .update(updateData)
        .eq('id', initialData.id);

      if (error) throw error;

      // Update local state
      if (isHeader) {
        setHeaderLogoUrl(null);
      } else {
        setFooterLogoUrl(null);
      }

      toast.success(`${isHeader ? '頁首' : '頁尾'} Logo 已刪除`);
    } catch (error: any) {
      console.error('Logo delete error:', error);
      toast.error('刪除失敗', { description: error.message });
    }
  };

  // Check subdomain availability
  const checkSubdomainAvailability = async (alias: string) => {
    if (!alias) {
      setSubdomainStatus("idle");
      return;
    }

    // Format validation
    if (!SUBDOMAIN_REGEX.test(alias)) {
      setSubdomainStatus("invalid");
      return;
    }

    setSubdomainStatus("checking");

    try {
      const query = supabase
        .from("accommodation_info")
        .select("id")
        .eq("short_url_alias", alias);

      // Exclude current accommodation when editing
      if (isEditing && initialData?.id) {
        query.neq("id", initialData.id);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error("Error checking subdomain:", error);
        setSubdomainStatus("idle");
        return;
      }

      setSubdomainStatus(data ? "taken" : "available");
    } catch (error) {
      console.error("Error checking subdomain:", error);
      setSubdomainStatus("idle");
    }
  };

  // Debounced subdomain check
  useEffect(() => {
    const timer = setTimeout(() => {
      checkSubdomainAvailability(formData.short_url_alias);
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.short_url_alias, isEditing, initialData?.id]);

  const handleSubdomainChange = (value: string) => {
    // Only allow lowercase letters, numbers, and hyphens
    const formatted = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setFormData({ ...formData, short_url_alias: formatted });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate subdomain if provided
    if (formData.short_url_alias) {
      if (!SUBDOMAIN_REGEX.test(formData.short_url_alias)) {
        toast.error("子網域格式錯誤", {
          description: "請使用小寫英文、數字和連字號，長度 3-30 字元",
        });
        return;
      }

      if (subdomainStatus === "taken") {
        toast.error("子網域已被使用", {
          description: "請選擇其他子網域名稱",
        });
        return;
      }

      if (subdomainStatus === "checking") {
        toast.error("正在檢查子網域", {
          description: "請稍候再試",
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSubdomainStatusIcon = () => {
    switch (subdomainStatus) {
      case "checking":
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case "available":
        return <CheckCircle2 className="h-4 w-4 text-primary" />;
      case "taken":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "invalid":
        return <AlertCircle className="h-4 w-4 text-amber-500" />;
      default:
        return null;
    }
  };

  const getSubdomainStatusText = () => {
    switch (subdomainStatus) {
      case "checking":
        return "檢查中...";
      case "available":
        return "可以使用";
      case "taken":
        return "已被使用";
      case "invalid":
        return "格式不正確";
      default:
        return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "編輯民宿" : "新增民宿"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "修改民宿基本資訊" : "輸入新民宿的基本資訊"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 民宿名稱 */}
          <div className="space-y-2">
            <Label htmlFor="name">民宿名稱 *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="請輸入民宿名稱"
              required
              disabled={isSubmitting}
            />
          </div>

          {/* 自訂子網域 */}
          <div className="space-y-2">
            <Label htmlFor="short_url_alias" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              自訂子網域
            </Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  id="short_url_alias"
                  value={formData.short_url_alias}
                  onChange={(e) => handleSubdomainChange(e.target.value)}
                  placeholder="例如：myhotel"
                  disabled={isSubmitting}
                  className="pr-10"
                  maxLength={30}
                />
                {formData.short_url_alias && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {getSubdomainStatusIcon()}
                  </div>
                )}
              </div>
              <span className="text-sm text-muted-foreground whitespace-nowrap">.lakeze.com</span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                使用小寫英文、數字和連字號，長度 3-30 字元
              </p>
              {formData.short_url_alias && subdomainStatus !== "idle" && (
                <p className={`text-xs flex items-center gap-1 ${
                  subdomainStatus === "available" ? "text-primary" :
                  subdomainStatus === "taken" ? "text-destructive" :
                  subdomainStatus === "invalid" ? "text-amber-500" :
                  "text-muted-foreground"
                }`}>
                  {getSubdomainStatusText()}
                </p>
              )}
            </div>
            {formData.short_url_alias && subdomainStatus === "available" && (
              <div className="bg-muted/50 rounded-md p-2 text-sm">
                <span className="text-muted-foreground">您的網站網址：</span>
                <span className="font-medium ml-1">https://{formData.short_url_alias}.lakeze.com</span>
              </div>
            )}
          </div>

          {/* 主題配色選擇 */}
          <div className="space-y-3">
            <Label htmlFor="theme_preset" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              網站主題配色
            </Label>
            
            <div className="grid grid-cols-2 gap-3">
              {/* 主題選擇按鈕 */}
              <div className="space-y-2">
                {THEME_PRESET_CONFIGS.map((theme) => (
                  <button
                    key={theme.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, theme_preset: theme.value })}
                    disabled={isSubmitting}
                    className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                      formData.theme_preset === theme.value 
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20' 
                        : 'border-border hover:border-primary/50 hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {/* 顏色指示點 */}
                      <div className="flex -space-x-1">
                        <div 
                          className="w-3.5 h-3.5 rounded-full border border-white shadow-sm"
                          style={{ backgroundColor: theme.colors.primary }}
                        />
                        <div 
                          className="w-3.5 h-3.5 rounded-full border border-white shadow-sm"
                          style={{ backgroundColor: theme.colors.accent }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{theme.label}</div>
                        <div className="text-xs text-muted-foreground truncate">{theme.description}</div>
                      </div>
                      {formData.theme_preset === theme.value && (
                        <div className="text-primary">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* 即時預覽 */}
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground text-center">網站預覽</p>
                <ThemePreview themeValue={formData.theme_preset} />
              </div>
            </div>
          </div>

          {/* Logo 上傳（僅編輯模式） */}
          {isEditing && initialData?.id && (
            <div className="space-y-4">
              <Label className="flex items-center gap-2">
                <Image className="h-4 w-4" />
                民宿 Logo
              </Label>
              
              <div className="grid grid-cols-2 gap-4">
                {/* 頁首 Logo */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">頁首 Logo</p>
                  <div className="border rounded-lg p-3 space-y-2">
                    {headerLogoUrl ? (
                      <div className="relative">
                        <div className="w-full h-16 border rounded overflow-hidden bg-muted">
                          <img 
                            src={headerLogoUrl} 
                            alt="頁首 Logo" 
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteLogo('header')}
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="w-full h-16 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground">
                        <span className="text-xs">尚未設定</span>
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => headerInputRef.current?.click()}
                      disabled={uploadingHeader || isSubmitting}
                      className="w-full"
                    >
                      {uploadingHeader ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Upload className="h-4 w-4 mr-1" />
                      )}
                      {uploadingHeader ? '上傳中...' : '上傳'}
                    </Button>
                    <input
                      ref={headerInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileSelect(e, 'header')}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* 頁尾 Logo */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">頁尾 Logo</p>
                  <div className="border rounded-lg p-3 space-y-2">
                    {footerLogoUrl ? (
                      <div className="relative">
                        <div className="w-full h-16 border rounded overflow-hidden bg-slate-800">
                          <img 
                            src={footerLogoUrl} 
                            alt="頁尾 Logo" 
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteLogo('footer')}
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="w-full h-16 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground">
                        <span className="text-xs">尚未設定</span>
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => footerInputRef.current?.click()}
                      disabled={uploadingFooter || isSubmitting}
                      className="w-full"
                    >
                      {uploadingFooter ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Upload className="h-4 w-4 mr-1" />
                      )}
                      {uploadingFooter ? '上傳中...' : '上傳'}
                    </Button>
                    <input
                      ref={footerInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileSelect(e, 'footer')}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                建議尺寸：200×60 像素，支援 PNG、JPG 格式
              </p>
            </div>
          )}

          {/* LINE Pay 設定（僅編輯模式） */}
          {isEditing && initialData?.id && (
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                付款方式設定
              </Label>
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">LINE Pay</span>
                      {linePayEnabled && (
                        <Badge variant="secondary" className="text-xs">已啟用</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      啟用後，前台訂房可使用 LINE Pay 線上付款
                    </p>
                  </div>
                  <Switch
                    checked={linePayEnabled}
                    onCheckedChange={handleLinePayToggle}
                    disabled={loadingLinePay || isSubmitting}
                  />
                </div>
                {loadingLinePay && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    更新中...
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || !formData.name || (formData.short_url_alias !== "" && (subdomainStatus === "taken" || subdomainStatus === "invalid" || subdomainStatus === "checking"))}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "儲存變更" : "新增民宿"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      {/* Logo Crop Dialog */}
      <LogoCropDialog
        open={cropDialogOpen}
        onOpenChange={(open) => {
          setCropDialogOpen(open);
          if (!open && cropImageSrc) {
            URL.revokeObjectURL(cropImageSrc);
            setCropImageSrc("");
          }
        }}
        imageSrc={cropImageSrc}
        onCropComplete={handleCropComplete}
        logoType={cropLogoType}
      />
    </Dialog>
  );
}
