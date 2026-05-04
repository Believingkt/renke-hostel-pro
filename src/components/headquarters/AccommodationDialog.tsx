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
import { Loader2, Globe, CheckCircle2, XCircle, AlertCircle, Upload, Trash2, Image, Crop, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { LogoCropDialog } from "@/components/LogoCropDialog";

interface AccommodationFormData {
  name: string;
  short_name: string;
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
  // 註：theme_preset 已從表單移除，所有民宿一律使用人客多橘色（由 onSubmit handler 在 DB 層強制寫入 "default"）
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

// URL path validation regex: lowercase letters, numbers, hyphens, 3-30 chars
const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$/;

// Reserved paths used by the booking portal routing — cannot be used as alias
const RESERVED_PATHS = new Set([
  "admin", "auth", "hq", "hq-auth", "headquarters", "booking", "book",
  "member", "ai-booking", "order-search", "order-payment", "payment",
  "payment-result", "linepay", "public-payment", "pay", "profile",
  "reset-password", "change-password", "kol-api-docs", "points-api-docs",
  "og-preview", "payment-test", "__cb", "api", "www",
]);

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
    short_name: "",
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
  });
  const [generatingShortName, setGeneratingShortName] = useState(false);

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

  // Deposit percentage state
  const [depositPercentage, setDepositPercentage] = useState<number>(30);
  const [loadingDeposit, setLoadingDeposit] = useState(false);

  // Transaction fee percentage state
  const [transactionFeePercentage, setTransactionFeePercentage] = useState<number>(0);
  const [loadingTransactionFee, setLoadingTransactionFee] = useState(false);

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
      });
      setHeaderLogoUrl(null);
      setFooterLogoUrl(null);
      setSubdomainStatus("idle");
      setLinePayEnabled(false);
    }
  }, [initialData, open]);

  // Load payment settings and transaction fee when editing
  useEffect(() => {
    if (isEditing && initialData?.id && open) {
      loadPaymentSettings(initialData.id);
      loadTransactionFeeSetting(initialData.id);
    }
  }, [isEditing, initialData?.id, open]);

  const loadPaymentSettings = async (accommodationId: string) => {
    try {
      const { data, error } = await supabase
        .from("booking_settings")
        .select("payment_methods, deposit_percentage")
        .eq("accommodation_id", accommodationId)
        .single();

      if (error) throw error;

      const paymentMethods = Array.isArray(data?.payment_methods) ? data.payment_methods : [];
      setLinePayEnabled(paymentMethods.includes("LINE Pay"));
      setDepositPercentage(data?.deposit_percentage ?? 30);
    } catch (error) {
      console.error("Error loading payment settings:", error);
    }
  };

  const loadTransactionFeeSetting = async (accommodationId: string) => {
    try {
      const { data, error } = await supabase
        .from("split_rules")
        .select("transaction_fee_percentage")
        .eq("accommodation_id", accommodationId)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;

      setTransactionFeePercentage(data?.transaction_fee_percentage ?? 0);
    } catch (error) {
      console.error("Error loading transaction fee setting:", error);
    }
  };

  const handleTransactionFeeChange = async (value: number) => {
    if (!initialData?.id) return;
    if (value < 0 || value > 100) return;

    setLoadingTransactionFee(true);
    try {
      const { error } = await supabase
        .from("split_rules")
        .update({ 
          transaction_fee_percentage: value,
          updated_at: new Date().toISOString()
        })
        .eq("accommodation_id", initialData.id)
        .eq("is_active", true);

      if (error) throw error;

      setTransactionFeePercentage(value);
      toast.success(`請款手續費已更新為 ${value}%`);
    } catch (error: any) {
      console.error("Error updating transaction fee:", error);
      toast.error("更新失敗", { description: error.message });
    } finally {
      setLoadingTransactionFee(false);
    }
  };

  const handleDepositPercentageChange = async (value: number) => {
    if (!initialData?.id) return;
    if (value < 0 || value > 100) return;

    setLoadingDeposit(true);
    try {
      const { error } = await supabase
        .from("booking_settings")
        .update({ 
          deposit_percentage: value,
          updated_at: new Date().toISOString()
        })
        .eq("accommodation_id", initialData.id);

      if (error) throw error;

      setDepositPercentage(value);
      toast.success(`訂金比例已更新為 ${value}%`);
    } catch (error: any) {
      console.error("Error updating deposit percentage:", error);
      toast.error("更新失敗", { description: error.message });
    } finally {
      setLoadingDeposit(false);
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

    // Reserved path check
    if (RESERVED_PATHS.has(alias.toLowerCase())) {
      setSubdomainStatus("taken");
      return;
    }

    setSubdomainStatus("checking");

    try {
      const query = supabase
        .from("accommodation_info")
        .select("id")
        .ilike("short_url_alias", alias);

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

    // Validate path if provided
    if (formData.short_url_alias) {
      if (!SUBDOMAIN_REGEX.test(formData.short_url_alias)) {
        toast.error("網址路徑格式錯誤", {
          description: "請使用小寫英文、數字和連字號，長度 3-30 字元",
        });
        return;
      }

      if (RESERVED_PATHS.has(formData.short_url_alias.toLowerCase())) {
        toast.error("此路徑為系統保留字", {
          description: "請使用其他名稱（避免使用 admin、auth、booking 等）",
        });
        return;
      }

      if (subdomainStatus === "taken") {
        toast.error("此網址路徑已被使用", {
          description: `booking.lakeze.com/${formData.short_url_alias} 已被其他民宿使用，請更換`,
        });
        return;
      }

      if (subdomainStatus === "checking") {
        toast.error("正在檢查網址路徑", {
          description: "請稍候再試",
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onOpenChange(false);
    } catch (error: any) {
      const code = error?.code || error?.cause?.code;
      const msg = String(error?.message || "");

      // Unique-violation: alias already taken
      if (code === "23505" || msg.includes("accommodation_info_short_url_alias_unique")) {
        toast.error("此網址路徑已被使用", {
          description: `booking.lakeze.com/${formData.short_url_alias} 已被其他民宿使用，請更換`,
        });
        setSubdomainStatus("taken");
        return;
      }

      // Server-side validation error from validate_short_url_alias trigger
      if (code === "22023" || msg.includes("網址路徑")) {
        toast.error("網址路徑驗證失敗", {
          description: msg.replace(/^.*?:\s*/, "") || "請檢查網址路徑格式",
        });
        setSubdomainStatus("invalid");
        return;
      }

      throw error;
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
        return "此路徑已被使用";
      case "invalid":
        return "格式不正確";
      default:
        return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-hidden p-0">
        <div className="flex flex-col h-full max-h-[90vh]">
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b bg-muted/30">
            <DialogTitle className="text-xl">{isEditing ? "編輯民宿" : "新增民宿"}</DialogTitle>
            <DialogDescription>
              {isEditing ? "修改民宿基本資訊與外觀設定" : "設定新民宿的基本資訊與網站風格"}
            </DialogDescription>
          </DialogHeader>

          {/* Content - Two Column Layout */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto">
              <div className="min-h-full">
                {/* Basic Info（主題配色已移除，固定使用人客多橘色） */}
                <div className="p-6 space-y-5 bg-background">
                  <div className="space-y-1">
                    <h3 className="font-semibold text-base flex items-center gap-2">
                      <div className="h-5 w-1 rounded-full bg-primary" />
                      基本資訊
                    </h3>
                    <p className="text-xs text-muted-foreground">設定民宿名稱與網站網址</p>
                  </div>

                  {/* 民宿名稱 */}
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium">民宿名稱 *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="請輸入民宿名稱"
                      required
                      disabled={isSubmitting}
                      className="h-11"
                    />
                  </div>

                  {/* 自訂網址路徑 */}
                  <div className="space-y-2">
                    <Label htmlFor="short_url_alias" className="flex items-center gap-2 text-sm font-medium">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      自訂網址路徑
                    </Label>
                    <div className="flex items-stretch rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                      <span className="flex items-center px-3 text-sm text-muted-foreground bg-muted/50 whitespace-nowrap font-medium border-r border-input">
                        booking.lakeze.com/
                      </span>
                      <div className="relative flex-1">
                        <Input
                          id="short_url_alias"
                          value={formData.short_url_alias}
                          onChange={(e) => handleSubdomainChange(e.target.value)}
                          placeholder="例如：myhotel"
                          disabled={isSubmitting}
                          className="pr-10 h-11 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                          maxLength={30}
                        />
                        {formData.short_url_alias && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            {getSubdomainStatusIcon()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        小寫英文、數字和連字號，3-30 字元
                      </p>
                      {formData.short_url_alias && subdomainStatus !== "idle" && (
                        <p className={`text-xs flex items-center gap-1 font-medium ${
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
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm">
                        <span className="text-muted-foreground">您的網站網址：</span>
                        <span className="font-semibold text-primary ml-1">https://booking.lakeze.com/{formData.short_url_alias}</span>
                      </div>
                    )}
                  </div>

                  {/* Logo 上傳（僅編輯模式） */}
                  {isEditing && initialData?.id && (
                    <>
                      <div className="pt-4 border-t">
                        <div className="space-y-1 mb-4">
                          <h3 className="font-semibold text-base flex items-center gap-2">
                            <div className="h-5 w-1 rounded-full bg-primary" />
                            Logo 設定
                          </h3>
                          <p className="text-xs text-muted-foreground">建議尺寸：200×60 像素，支援 PNG、JPG</p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          {/* 頁首 Logo */}
                          <div className="space-y-2">
                            <p className="text-sm font-medium">頁首 Logo</p>
                            <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                              {headerLogoUrl ? (
                                <div className="relative">
                                  <div className="w-full h-14 border rounded overflow-hidden bg-white">
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
                                <div className="w-full h-14 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground bg-background">
                                  <span className="text-xs">尚未設定</span>
                                </div>
                              )}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => headerInputRef.current?.click()}
                                disabled={uploadingHeader || isSubmitting}
                                className="w-full h-8"
                              >
                                {uploadingHeader ? (
                                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : (
                                  <Upload className="h-3 w-3 mr-1" />
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
                            <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                              {footerLogoUrl ? (
                                <div className="relative">
                                  <div className="w-full h-14 border rounded overflow-hidden bg-slate-800">
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
                                <div className="w-full h-14 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground bg-background">
                                  <span className="text-xs">尚未設定</span>
                                </div>
                              )}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => footerInputRef.current?.click()}
                                disabled={uploadingFooter || isSubmitting}
                                className="w-full h-8"
                              >
                                {uploadingFooter ? (
                                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                ) : (
                                  <Upload className="h-3 w-3 mr-1" />
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
                      </div>

                      {/* 付款設定 */}
                      <div className="pt-4 border-t">
                        <div className="space-y-1 mb-4">
                          <h3 className="font-semibold text-base flex items-center gap-2">
                            <div className="h-5 w-1 rounded-full bg-primary" />
                            付款設定
                          </h3>
                        </div>
                        <div className="space-y-3">
                          {/* 訂金比例設定 */}
                          <div className="border rounded-lg p-4 bg-muted/30">
                            <div className="flex items-center justify-between">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium text-sm">訂金比例</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  線上付款時收取的訂金百分比
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={depositPercentage}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    if (val >= 0 && val <= 100) {
                                      setDepositPercentage(val);
                                    }
                                  }}
                                  onBlur={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    if (val !== depositPercentage) {
                                      handleDepositPercentageChange(val);
                                    }
                                  }}
                                  disabled={loadingDeposit || isSubmitting}
                                  className="w-20 h-9 text-center"
                                />
                                <span className="text-sm text-muted-foreground">%</span>
                                {loadingDeposit && (
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 請款手續費設定 */}
                          <div className="border rounded-lg p-4 bg-muted/30">
                            <div className="flex items-center justify-between">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium text-sm">請款手續費</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  請款時從民宿分潤扣除的手續費比例
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.1}
                                  value={transactionFeePercentage}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    if (val >= 0 && val <= 100) {
                                      setTransactionFeePercentage(val);
                                    }
                                  }}
                                  onBlur={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    if (val !== transactionFeePercentage) {
                                      handleTransactionFeeChange(val);
                                    }
                                  }}
                                  disabled={loadingTransactionFee || isSubmitting}
                                  className="w-20 h-9 text-center"
                                />
                                <span className="text-sm text-muted-foreground">%</span>
                                {loadingTransactionFee && (
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                )}
                              </div>
                            </div>
                          </div>

                          {/* LINE Pay 設定 */}
                          <div className="border rounded-lg p-4 bg-muted/30">
                            <div className="flex items-center justify-between">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium text-sm">LINE Pay</span>
                                  {linePayEnabled && (
                                    <Badge variant="secondary" className="text-xs">已啟用</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  啟用後可使用 LINE Pay 線上付款
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
                      </div>
                    </>
                  )}
                </div>

                {/* 主題配色已移除：所有民宿統一使用人客多橘色 */}
              </div>
            </div>

            {/* Footer */}
            <DialogFooter className="px-6 py-4 border-t bg-muted/30">
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
                className="min-w-[120px]"
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "儲存變更" : "新增民宿"}
              </Button>
            </DialogFooter>
          </form>
        </div>
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
