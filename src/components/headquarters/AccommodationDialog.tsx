import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, Globe, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

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
}

interface AccommodationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AccommodationFormData) => Promise<void>;
  initialData?: Partial<AccommodationFormData> & { id?: string };
  isEditing?: boolean;
}

const accommodationTypes = [
  { value: "民宿", label: "民宿" },
  { value: "旅館", label: "旅館" },
  { value: "飯店", label: "飯店" },
  { value: "露營區", label: "露營區" },
  { value: "度假村", label: "度假村" },
];

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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "編輯民宿" : "新增民宿"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "修改民宿基本資訊" : "輸入新民宿的基本資訊"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
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

            {/* Subdomain field */}
            <div className="col-span-2 space-y-2">
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

            <div className="space-y-2">
              <Label htmlFor="type">類型</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
                disabled={isSubmitting}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accommodationTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="registration_number">登記證號</Label>
              <Input
                id="registration_number"
                value={formData.registration_number}
                onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
                placeholder="例如：台觀業字第000號"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region_1">縣市</Label>
              <Input
                id="region_1"
                value={formData.region_1}
                onChange={(e) => setFormData({ ...formData, region_1: e.target.value })}
                placeholder="例如：台北市"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region_2">區域</Label>
              <Input
                id="region_2"
                value={formData.region_2}
                onChange={(e) => setFormData({ ...formData, region_2: e.target.value })}
                placeholder="例如：中山區"
                disabled={isSubmitting}
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="address">地址</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="請輸入完整地址"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">電話</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="例如：02-1234-5678"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="例如：contact@example.com"
                disabled={isSubmitting}
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="description">簡介</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="請輸入民宿簡介..."
                rows={3}
                disabled={isSubmitting}
              />
            </div>
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
