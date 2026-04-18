/**
 * 自訂區塊管理元件
 * 讓使用者上傳圖片並在前台顯示
 */

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Upload, Image as ImageIcon, Loader2, Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/utils/imageCompression";

interface CustomSection {
  id: string;
  accommodation_id: string;
  title: string | null;
  subtitle: string | null;
  image_url: string;
  mobile_image_url: string | null;
  display_order: number;
  is_enabled: boolean;
  link_url: string | null;
  link_text: string | null;
}

interface CustomSectionsManagerProps {
  accommodationId: string;
  sections: CustomSection[];
  onSectionsChange: (sections: CustomSection[]) => void;
}

interface SortableSectionCardProps {
  section: CustomSection;
  accommodationId: string;
  onUpdate: (id: string, updates: Partial<CustomSection>) => void;
  onDelete: (id: string) => void;
  onImageUpload: (id: string, file: File, type: 'desktop' | 'mobile') => void;
  isUploading: boolean;
  uploadingId: string | null;
  uploadType: 'desktop' | 'mobile' | null;
}

const SectionCard = ({ 
  section, 
  accommodationId,
  onUpdate, 
  onDelete, 
  onImageUpload,
  isUploading,
  uploadingId,
  uploadType
}: SortableSectionCardProps) => {
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'desktop' | 'mobile') => {
    const file = e.target.files?.[0];
    if (file) {
      onImageUpload(section.id, file, type);
    }
    e.target.value = '';
  };

  const isCurrentUploading = isUploading && uploadingId === section.id;

  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="space-y-4">
          {/* 標題與啟用開關 */}
          <div className="flex items-center justify-between">
            <div className="flex-1 mr-4">
              <Input
                placeholder="區塊標題（選填）"
                value={section.title || ''}
                onChange={(e) => onUpdate(section.id, { title: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor={`enabled-${section.id}`} className="text-sm whitespace-nowrap">啟用</Label>
                <Switch
                  id={`enabled-${section.id}`}
                  checked={section.is_enabled}
                  onCheckedChange={(checked) => onUpdate(section.id, { is_enabled: checked })}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => onDelete(section.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* 圖片上傳區域 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 電腦版圖片 */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                <Monitor className="h-4 w-4" />
                電腦版圖片（必填）
              </Label>
              <div 
                className="relative aspect-[21/9] border-2 border-dashed rounded-lg overflow-hidden hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => desktopInputRef.current?.click()}
              >
                {section.image_url ? (
                  <img 
                    src={section.image_url} 
                    alt="電腦版圖片" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-8 w-8 mb-2" />
                    <span className="text-sm">點擊上傳圖片</span>
                    <span className="text-xs mt-1">建議尺寸 1920 x 800</span>
                  </div>
                )}
                {isCurrentUploading && uploadType === 'desktop' && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                )}
              </div>
              <input
                ref={desktopInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileChange(e, 'desktop')}
              />
            </div>

            {/* 手機版圖片 */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                <Smartphone className="h-4 w-4" />
                手機版圖片（選填）
              </Label>
              <div 
                className="relative aspect-[9/16] max-h-[200px] border-2 border-dashed rounded-lg overflow-hidden hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => mobileInputRef.current?.click()}
              >
                {section.mobile_image_url ? (
                  <img 
                    src={section.mobile_image_url} 
                    alt="手機版圖片" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-8 w-8 mb-2" />
                    <span className="text-sm">點擊上傳</span>
                    <span className="text-xs mt-1">建議 9:16</span>
                  </div>
                )}
                {isCurrentUploading && uploadType === 'mobile' && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                )}
              </div>
              <input
                ref={mobileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileChange(e, 'mobile')}
              />
            </div>
          </div>

          {/* 連結設定 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-sm">連結網址（選填）</Label>
              <Input
                placeholder="https://..."
                value={section.link_url || ''}
                onChange={(e) => onUpdate(section.id, { link_url: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">按鈕文字（選填）</Label>
              <Input
                placeholder="立即了解"
                value={section.link_text || ''}
                onChange={(e) => onUpdate(section.id, { link_text: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>
  );
};

export const CustomSectionsManager = ({ 
  accommodationId, 
  sections, 
  onSectionsChange 
}: CustomSectionsManagerProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<'desktop' | 'mobile' | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);




  const handleAddSection = async () => {
    setIsAdding(true);
    try {
      const maxOrder = sections.length > 0 
        ? Math.max(...sections.map(s => s.display_order)) 
        : 0;

      // 建立暫存區塊（需要先上傳圖片）
      const tempSection: CustomSection = {
        id: `temp-${Date.now()}`,
        accommodation_id: accommodationId,
        title: null,
        subtitle: null,
        image_url: '',
        mobile_image_url: null,
        display_order: maxOrder + 1,
        is_enabled: true,
        link_url: null,
        link_text: null,
      };

      onSectionsChange([...sections, tempSection]);
    } finally {
      setIsAdding(false);
    }
  };

  const handleImageUpload = async (sectionId: string, file: File, type: 'desktop' | 'mobile') => {
    const { validateImageUpload } = await import("@/utils/imageUploadValidation");
    const validation = await validateImageUpload(file);
    if (validation.ok === false) {
      toast.error(`上傳失敗：${validation.reason}`);
      return;
    }

    setIsUploading(true);
    setUploadingId(sectionId);
    setUploadType(type);

    try {
      // 壓縮圖片
      const compressedResult = await compressImage(file, {
        maxWidth: type === 'desktop' ? 1920 : 1080,
        maxHeight: type === 'desktop' ? 1080 : 1920,
        quality: 0.85,
      });

      const fileName = `${accommodationId}/${sectionId}-${type}-${Date.now()}.jpg`;
      
      const { error: uploadError } = await supabase.storage
        .from('custom-sections')
        .upload(fileName, compressedResult.blob, {
          cacheControl: '31536000',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('custom-sections')
        .getPublicUrl(fileName);

      // 更新區塊
      const updates = type === 'desktop' 
        ? { image_url: publicUrl }
        : { mobile_image_url: publicUrl };

      const section = sections.find(s => s.id === sectionId);
      
      // 如果是暫存區塊且上傳的是電腦版圖片，則儲存到資料庫
      if (section && sectionId.startsWith('temp-') && type === 'desktop') {
        const { data, error } = await supabase
          .from('custom_sections')
          .insert({
            accommodation_id: accommodationId,
            title: section.title,
            subtitle: section.subtitle,
            image_url: publicUrl,
            mobile_image_url: section.mobile_image_url,
            display_order: section.display_order,
            is_enabled: section.is_enabled,
            link_url: section.link_url,
            link_text: section.link_text,
          })
          .select()
          .single();

        if (error) throw error;

        // 替換暫存區塊為實際區塊
        onSectionsChange(sections.map(s => s.id === sectionId ? data : s));
      } else if (!sectionId.startsWith('temp-')) {
        // 更新現有區塊
        const { error } = await supabase
          .from('custom_sections')
          .update(updates)
          .eq('id', sectionId);

        if (error) throw error;

        onSectionsChange(sections.map(s => 
          s.id === sectionId ? { ...s, ...updates } : s
        ));
      } else {
        // 暫存區塊但不是電腦版圖片，只更新本地狀態
        onSectionsChange(sections.map(s => 
          s.id === sectionId ? { ...s, ...updates } : s
        ));
      }

      toast.success('圖片上傳成功');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('圖片上傳失敗：' + (error.message || '未知錯誤'));
    } finally {
      setIsUploading(false);
      setUploadingId(null);
      setUploadType(null);
    }
  };

  const handleUpdate = async (id: string, updates: Partial<CustomSection>) => {
    // 更新本地狀態
    onSectionsChange(sections.map(s => 
      s.id === id ? { ...s, ...updates } : s
    ));

    // 如果不是暫存區塊，則同步到資料庫
    if (!id.startsWith('temp-')) {
      try {
        const { error } = await supabase
          .from('custom_sections')
          .update(updates)
          .eq('id', id);

        if (error) throw error;
      } catch (error: any) {
        console.error('Update error:', error);
        toast.error('更新失敗');
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      if (!id.startsWith('temp-')) {
        const { error } = await supabase
          .from('custom_sections')
          .delete()
          .eq('id', id);

        if (error) throw error;
      }

      onSectionsChange(sections.filter(s => s.id !== id));
      toast.success('區塊已刪除');
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error('刪除失敗');
    } finally {
      setDeleteId(null);
    }
  };




  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-1.5 bg-primary rounded-full" />
            <div>
              <CardTitle className="text-xl">自訂圖片區塊</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">新增滿版圖片區塊，電腦版寬螢幕顯示，手機版自適應比例</p>
            </div>
          </div>
          <Button onClick={handleAddSection} disabled={isAdding}>
            {isAdding ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            新增區塊
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {sections.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>尚未新增任何自訂區塊</p>
            <p className="text-sm mt-1">點擊「新增區塊」開始建立</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sections.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                accommodationId={accommodationId}
                onUpdate={handleUpdate}
                onDelete={(id) => setDeleteId(id)}
                onImageUpload={handleImageUpload}
                isUploading={isUploading}
                uploadingId={uploadingId}
                uploadType={uploadType}
              />
            ))}
          </div>
        )}
      </CardContent>

      {/* 刪除確認對話框 */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除此區塊？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作無法復原，區塊及其圖片將被永久刪除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && handleDelete(deleteId)}
            >
              確定刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
