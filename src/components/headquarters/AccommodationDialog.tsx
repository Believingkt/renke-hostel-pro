import { useState, useEffect } from "react";
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
import { Loader2 } from "lucide-react";

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
}

interface AccommodationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AccommodationFormData) => Promise<void>;
  initialData?: Partial<AccommodationFormData>;
  isEditing?: boolean;
}

const accommodationTypes = [
  { value: "民宿", label: "民宿" },
  { value: "旅館", label: "旅館" },
  { value: "飯店", label: "飯店" },
  { value: "露營區", label: "露營區" },
  { value: "度假村", label: "度假村" },
];

export function AccommodationDialog({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  isEditing = false,
}: AccommodationDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      });
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
      });
    }
  }, [initialData, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
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
            <Button type="submit" disabled={isSubmitting || !formData.name}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "儲存變更" : "新增民宿"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
