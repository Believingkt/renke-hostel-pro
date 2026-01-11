import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Globe, CheckCircle2, XCircle, AlertCircle, Palette } from "lucide-react";
import { toast } from "sonner";

// 主題預設選項
const THEME_PRESETS = [
  { value: "default", label: "森林綠（預設）", description: "清新自然的綠色調" },
  { value: "warm", label: "南瓜橘", description: "溫暖的焦糖橘色調" },
  { value: "ocean", label: "海洋藍", description: "沉靜的藍色調" },
  { value: "elegant", label: "優雅紫", description: "高雅的紫灰色調" },
] as const;

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
  initialData?: Partial<AccommodationFormData> & { id?: string };
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
      setSubdomainStatus("idle");
    }
  }, [initialData, open]);

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
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
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
      <DialogContent className="sm:max-w-[500px]">
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
                  subdomainStatus === "available" ? "text-green-600" :
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
          <div className="space-y-2">
            <Label htmlFor="theme_preset" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              網站主題配色
            </Label>
            <Select
              value={formData.theme_preset}
              onValueChange={(value) => setFormData({ ...formData, theme_preset: value })}
              disabled={isSubmitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="選擇主題配色" />
              </SelectTrigger>
              <SelectContent>
                {THEME_PRESETS.map((theme) => (
                  <SelectItem key={theme.value} value={theme.value}>
                    <div className="flex flex-col">
                      <span>{theme.label}</span>
                      <span className="text-xs text-muted-foreground">{theme.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              選擇民宿前台網站的整體配色風格
            </p>
          </div>

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
    </Dialog>
  );
}
