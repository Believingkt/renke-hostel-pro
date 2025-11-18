import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SaveButtonContainer } from "@/components/ui/save-button-container";
import { Mountain, Sparkles, UserCheck, Camera, Home, Heart, Star, Wifi, Coffee, Car } from "lucide-react";
import { Upload, Trash2 } from "lucide-react";

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
  const [formData, setFormData] = useState<AboutFeature>(
    feature || {
      title: '',
      description: '',
      icon_type: 'lucide',
      icon_name: 'Mountain',
      display_order: 0,
    }
  );
  const [uploadingIcon, setUploadingIcon] = useState(false);

  const handleSubmit = () => {
    onSave(formData);
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
      icon_type: 'custom',
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

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>標題</Label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="例如：山林環抱"
            />
          </div>

          <div className="space-y-2">
            <Label>說明文字</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="請輸入說明文字"
              rows={3}
            />
          </div>

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
                  onChange={handleIconUpload}
                  className="hidden"
                />
                {formData.icon_url && (
                  <div className="flex items-center gap-2">
                    <div className="relative w-16 h-16 border rounded overflow-hidden">
                      <img
                        src={formData.icon_url}
                        alt="圖示預覽"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setFormData({ ...formData, icon_url: undefined })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                建議尺寸：128x128 像素，支援 PNG、SVG 格式
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>預覽</Label>
            <div className="border rounded-lg p-6 text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                {formData.icon_type === 'lucide' && IconComponent ? (
                  <IconComponent className="h-10 w-10 text-primary" />
                ) : formData.icon_url ? (
                  <img src={formData.icon_url} alt="圖示" className="w-10 h-10 object-contain" />
                ) : (
                  <div className="text-muted-foreground text-xs">未選擇</div>
                )}
              </div>
              <h3 className="font-semibold text-lg mb-2">{formData.title || '標題'}</h3>
              <p className="text-sm text-muted-foreground">{formData.description || '說明文字'}</p>
            </div>
          </div>
        </div>

        <SaveButtonContainer 
          onSave={handleSubmit} 
          disabled={!formData.title || !formData.description}
          saveText="儲存"
          className="border-t-0 gap-3"
        >
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
        </SaveButtonContainer>
      </DialogContent>
    </Dialog>
  );
}
