import { useState } from "react";
import { Upload, Info, Trash2, GripVertical, Eye } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface WebInfoSectionProps {
  accommodationId: string;
  heroPhotos: any[];
  heroMainTitle: string;
  heroSubtitle: string;
  heroDescription: string;
  heroOverlayOpacity: number;
  heroAutoplayDelay: number;
  onUpdate: () => void;
  onHeroPhotoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteHeroPhoto: (photoId: string) => void;
  onHeroPhotoReorder: (newOrder: any[]) => void;
  onPreviewCarousel: () => void;
  onHeroTitleChange: (field: 'hero_main_title' | 'hero_subtitle' | 'hero_description', value: string) => void;
  onHeroSettingChange: (field: 'hero_overlay_opacity' | 'hero_autoplay_delay', value: number) => void;
  uploadingHeroPhoto: boolean;
}

interface SortablePhotoProps {
  photo: any;
  onDelete: (photoId: string) => void;
}

const SortablePhoto = ({ photo, onDelete }: SortablePhotoProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div 
        className="aspect-video rounded-lg overflow-hidden border bg-muted"
      >
        <img
          src={photo.photo_url}
          alt="輪播圖"
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 cursor-move bg-background/80 rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <Button
        type="button"
        variant="destructive"
        size="icon"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(photo.id);
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      {photo.title && (
        <div className="absolute bottom-2 left-2 right-2 bg-black/60 text-white text-xs p-2 rounded">
          {photo.title}
        </div>
      )}
    </div>
  );
};

export const WebInfoSection = ({ 
  accommodationId, 
  heroPhotos,
  heroMainTitle,
  heroSubtitle,
  heroDescription,
  heroOverlayOpacity,
  heroAutoplayDelay,
  onUpdate,
  onHeroPhotoUpload,
  onDeleteHeroPhoto,
  onHeroPhotoReorder,
  onPreviewCarousel,
  onHeroTitleChange,
  onHeroSettingChange,
  uploadingHeroPhoto
}: WebInfoSectionProps) => {
  const [isSaving, setIsSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = heroPhotos.findIndex((photo) => photo.id === active.id);
      const newIndex = heroPhotos.findIndex((photo) => photo.id === over.id);

      const newOrder = arrayMove(heroPhotos, oldIndex, newIndex);
      onHeroPhotoReorder(newOrder);
    }
  };

  const handleSave = async () => {
    toast.success('輪播圖順序已儲存');
    onUpdate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>輪播圖設定</CardTitle>
        <CardDescription>設定首頁主視覺輪播圖片、文字內容與視覺效果</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* 全局設定區塊 */}
        <div className="rounded-lg border bg-muted/30 p-6 space-y-6">
          <div className="flex items-center gap-2 pb-2 border-b">
            <div className="h-8 w-1 bg-primary rounded-full" />
            <div>
              <h3 className="font-semibold text-lg">輪播圖全局設定</h3>
              <p className="text-sm text-muted-foreground">統一設定所有輪播圖的標題、視覺效果和播放行為</p>
            </div>
          </div>

          {/* 標題設定 */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">標題內容</h4>
            
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hero-main-title" className="text-base">主標題</Label>
                <Input
                  id="hero-main-title"
                  value={heroMainTitle}
                  onChange={(e) => onHeroTitleChange('hero_main_title', e.target.value)}
                  placeholder="例：歡迎來到我們的民宿"
                  maxLength={20}
                  className="text-base"
                />
                <p className="text-xs text-muted-foreground">
                  {heroMainTitle.length}/20 字元 · 會顯示在所有輪播圖上
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hero-subtitle" className="text-base">副標題</Label>
                <Input
                  id="hero-subtitle"
                  value={heroSubtitle}
                  onChange={(e) => onHeroTitleChange('hero_subtitle', e.target.value)}
                  placeholder="例：體驗最舒適的住宿環境"
                  maxLength={20}
                  className="text-base"
                />
                <p className="text-xs text-muted-foreground">
                  {heroSubtitle.length}/20 字元
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="hero-description" className="text-base">
                  次標題 <span className="text-muted-foreground font-normal">(選填)</span>
                </Label>
                <Input
                  id="hero-description"
                  value={heroDescription}
                  onChange={(e) => onHeroTitleChange('hero_description', e.target.value)}
                  placeholder="例：享受自然與寧靜的完美結合"
                  maxLength={20}
                  className="text-base"
                />
                <p className="text-xs text-muted-foreground">
                  {heroDescription.length}/20 字元
                </p>
              </div>
            </div>
          </div>

          {/* 視覺效果設定 */}
          <div className="space-y-4 pt-4 border-t">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">視覺效果</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="hero-overlay-opacity" className="text-base">背景遮罩</Label>
                  <span className="text-sm font-semibold text-primary">{heroOverlayOpacity}%</span>
                </div>
                <input
                  id="hero-overlay-opacity"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={heroOverlayOpacity}
                  onChange={(e) => onHeroSettingChange('hero_overlay_opacity', parseInt(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <p className="text-xs text-muted-foreground">
                  調整圖片上的黑色遮罩透明度，提升文字可讀性
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="hero-autoplay-delay" className="text-base">播放速度</Label>
                  <span className="text-sm font-semibold text-primary">{heroAutoplayDelay} 秒</span>
                </div>
                <input
                  id="hero-autoplay-delay"
                  type="range"
                  min="3"
                  max="15"
                  step="1"
                  value={heroAutoplayDelay}
                  onChange={(e) => onHeroSettingChange('hero_autoplay_delay', parseInt(e.target.value))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <p className="text-xs text-muted-foreground">
                  每張輪播圖停留時間，建議 5-10 秒
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 輪播圖管理 */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-1 bg-primary rounded-full" />
            <div>
              <h3 className="font-semibold text-lg">輪播圖管理</h3>
              <p className="text-sm text-muted-foreground">上傳和管理首頁輪播圖片（最多 5 張）</p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => document.getElementById('hero-photo-upload')?.click()}
              disabled={uploadingHeroPhoto || heroPhotos.length >= 5}
              className="flex items-center gap-2 min-w-[140px]"
            >
              <Upload className="h-4 w-4" />
              {uploadingHeroPhoto ? "上傳中..." : "上傳輪播圖"}
            </Button>
            {heroPhotos.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                onClick={onPreviewCarousel}
                className="flex items-center gap-2 min-w-[140px]"
              >
                <Eye className="h-4 w-4" />
                預覽輪播效果
              </Button>
            )}
            <input
              id="hero-photo-upload"
              type="file"
              accept="image/*"
              onChange={onHeroPhotoUpload}
              className="hidden"
            />
            <div className="flex items-center gap-2 text-sm">
              <span className={heroPhotos.length >= 5 ? "text-destructive font-medium" : "text-muted-foreground"}>
                已上傳 {heroPhotos.length}/5 張
              </span>
            </div>
          </div>
          
          <div className="rounded-lg border bg-muted/10 p-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">建議尺寸：</span>1920×1080 像素 · 
              <span className="font-medium text-foreground"> 支援格式：</span>JPG、PNG · 
              <span className="font-medium text-foreground"> 自動優化：</span>上傳後轉換為 WebP 格式
            </p>
          </div>

          {/* 輪播圖列表 */}
          {heroPhotos.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  已上傳的輪播圖
                </p>
                <p className="text-xs text-muted-foreground">
                  拖拽調整順序 · 點擊編輯樣式
                </p>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={heroPhotos.map(p => p.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {heroPhotos
                      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
                      .map((photo) => (
                        <SortablePhoto
                          key={photo.id}
                          photo={photo}
                          onDelete={onDeleteHeroPhoto}
                        />
                      ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </div>

      </CardContent>
    </Card>
  );
};
