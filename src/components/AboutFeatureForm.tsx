import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ValidatedInput } from "@/components/ui/validated-input";
import { ValidatedTextarea } from "@/components/ui/validated-textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { SaveButtonContainer } from "@/components/ui/save-button-container";
import { DraftRestoreBanner } from "@/components/ui/draft-restore-banner";
import { Mountain, Sparkles, UserCheck, Camera, Home, Heart, Star, Wifi, Coffee, Car } from "lucide-react";
import { Upload, Trash2 } from "lucide-react";
import { featureSchema } from "@/utils/websiteValidation";
import { useFormDraft } from "@/hooks/use-form-draft";
import { toast } from "sonner";

interface AboutFeature {
  id?: string;
  title: string;
  description: string;
  icon_type: string;
  icon_name: string;
  icon_url?: string;
  display_order: number;
}

interface AboutFeatureFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: AboutFeature | null;
  onSave: (feature: AboutFeature) => void;
}

const BUILT_IN_ICONS = [
  { name: 'Mountain', icon: Mountain, label: '山林' },
  { name: 'Sparkles', icon: Sparkles, label: '星光' },
  { name: 'UserCheck', icon: UserCheck, label: '服務' },
  { name: 'Camera', icon: Camera, label: '相機' },
  { name: 'Home', icon: Home, label: '房屋' },
  { name: 'Heart', icon: Heart, label: '愛心' },
  { name: 'Star', icon: Star, label: '星星' },
  { name: 'Wifi', icon: Wifi, label: 'WiFi' },
  { name: 'Coffee', icon: Coffee, label: '咖啡' },
  { name: 'Car', icon: Car, label: '汽車' },
];

export function AboutFeatureForm({ open, onOpenChange, feature, onSave }: AboutFeatureFormProps) {
  const isMobile = useIsMobile();
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const initialFormData = {
    title: '',
    description: '',
    icon_type: 'lucide',
    icon_name: 'Mountain',
    icon_url: '',
    display_order: 0,
  };

  const {
    formData,
    setFormData,
    hasDraft,
    restoreDraft,
    discardDraft,
    clearDraft,
  } = useFormDraft({
    key: `about-feature-form-${feature?.id || 'new'}`,
    initialData: initialFormData,
  });

  // 重置表單當 feature prop 改變時
  useEffect(() => {
    if (open) {
      if (feature) {
        // 編輯模式：直接設置表單資料並清除草稿
        setFormData({
          title: feature.title,
          description: feature.description,
          icon_type: feature.icon_type,
          icon_name: feature.icon_name,
          icon_url: feature.icon_url || '',
          display_order: feature.display_order,
        });
        clearDraft(); // 清除舊草稿，避免提示
      } else {
        // 新增模式：使用初始資料
        setFormData(initialFormData);
      }
      setErrors({});
    }
  }, [feature, open, setFormData, clearDraft]);

  const validateField = (field: string, value: string) => {
    try {
      featureSchema.shape[field as keyof typeof featureSchema.shape].parse(value);
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    } catch (error: any) {
      if (error.errors?.[0]) {
        setErrors(prev => ({ ...prev, [field]: error.errors[0].message }));
      }
    }
  };

  const handleSubmit = () => {
    // 驗證表單
    const validationResult = featureSchema.safeParse({
      title: formData.title,
      description: formData.description,
      iconName: formData.icon_name,
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

    const featureData = {
      ...feature,
      title: formData.title,
      description: formData.description,
      icon_type: formData.icon_type,
      icon_name: formData.icon_name,
      icon_url: formData.icon_url || undefined,
      display_order: formData.display_order,
    } as AboutFeature;

    onSave(featureData);
    clearDraft();
    setErrors({});
    onOpenChange(false);
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingIcon(true);
    // TODO: Implement icon upload to storage
    // For now, just set a placeholder
    setFormData({
      ...formData,
      icon_url: URL.createObjectURL(file),
    });
    setUploadingIcon(false);
  };

  const selectedIcon = BUILT_IN_ICONS.find(icon => icon.name === formData.icon_name);
  const IconComponent = selectedIcon?.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{feature ? '編輯特色區塊' : '新增特色區塊'}</DialogTitle>
        </DialogHeader>

        {hasDraft && !feature && (
          <DraftRestoreBanner
            onRestore={restoreDraft}
            onDiscard={discardDraft}
          />
        )}

        <div className="space-y-4">
          <ValidatedInput
            id="feature-title"
            label="標題"
            value={formData.title}
            onChange={(value) => {
              setFormData({ ...formData, title: value });
              validateField('title', value);
            }}
            onValidate={(value) => validateField('title', value)}
            error={errors.title}
            placeholder="例如：山林環抱"
            required
            showCharCount
            maxLength={30}
          />

          <ValidatedTextarea
            id="feature-description"
            label="說明文字"
            value={formData.description}
            onChange={(value) => {
              setFormData({ ...formData, description: value });
              validateField('description', value);
            }}
            onValidate={(value) => validateField('description', value)}
            error={errors.description}
            placeholder="請輸入說明文字"
            rows={3}
            required
            showCharCount
            maxLength={200}
          />

          <div className="space-y-2">
            <Label>圖示選擇</Label>
            <Select
              value={formData.icon_type}
              onValueChange={(value) => setFormData({ ...formData, icon_type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lucide">使用內建圖示</SelectItem>
                <SelectItem value="custom">上傳自訂圖示</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.icon_type === 'lucide' && (
            <div className="space-y-2">
              <Label>選擇圖示</Label>
              <div className="grid grid-cols-5 gap-3">
                {BUILT_IN_ICONS.map((icon) => {
                  const Icon = icon.icon;
                  return (
                    <button
                      key={icon.name}
                      type="button"
                      onClick={() => setFormData({ ...formData, icon_name: icon.name })}
                      className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                        formData.icon_name === icon.name
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <Icon className="h-6 w-6" />
                      <span className="text-xs">{icon.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {formData.icon_type === 'custom' && (
            <div className="space-y-2">
              <Label>上傳圖示</Label>
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('icon-upload')?.click()}
                  disabled={uploadingIcon}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadingIcon ? '上傳中...' : '選擇圖示'}
                </Button>
                <input
                  id="icon-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleIconUpload}
                />
                {formData.icon_url && (
                  <div className="relative w-12 h-12 rounded-lg border overflow-hidden">
                    <img src={formData.icon_url} alt="Custom icon" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, icon_url: '' })}
                      className="absolute top-0 right-0 p-1 bg-destructive text-destructive-foreground rounded-bl"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 預覽 */}
          <div className="space-y-2">
            <Label>預覽</Label>
            <div className="p-6 border rounded-lg bg-muted/30">
              <div className="flex flex-col items-center gap-3 text-center">
                {formData.icon_type === 'lucide' && IconComponent && (
                  <div className="p-3 rounded-full bg-primary/10">
                    <IconComponent className="h-8 w-8 text-primary" />
                  </div>
                )}
                {formData.icon_type === 'custom' && formData.icon_url && (
                  <div className="w-14 h-14 rounded-full overflow-hidden">
                    <img src={formData.icon_url} alt="Custom icon" className="w-full h-full object-cover" />
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-lg">{formData.title || '標題預覽'}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formData.description || '說明文字預覽'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <SaveButtonContainer onSave={handleSubmit}>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
          </SaveButtonContainer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
