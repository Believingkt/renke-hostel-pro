import { useState } from "react";
import { Upload, Info, Trash2, GripVertical, Eye } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SaveButtonContainer } from "@/components/ui/save-button-container";
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
  verticalListSortingStrategy,
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
  onSave: () => Promise<void>;
  isSaving?: boolean;
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
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-10 w-10 sm:h-8 sm:w-8 touch-manipulation"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(photo.id);
        }}
      >
        <Trash2 className="h-5 w-5 sm:h-4 sm:w-4" />
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
  uploadingHeroPhoto,
  onSave,
  isSaving = false
}: WebInfoSectionProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
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

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-1.5 bg-primary rounded-full" />
          <div>
            <CardTitle className="text-xl">輪播圖管理（精選照片）</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              首頁輪播圖片（最多 5 張）與全局顯示設定。此處上傳的「精選照片」也會作為訂房詳情頁（包棟頁）最上方的圖片輪播來源，未設定時則不顯示。
            </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* 輪播圖管理 */}
        <div className="space-y-4">
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => document.getElementById('hero-photo-upload')?.click()}
              disabled={uploadingHeroPhoto || heroPhotos.length >= 5}
              className="flex items-center gap-2 min-w-[140px] h-11 sm:h-10 touch-manipulation"
            >
              <Upload className="h-4 w-4" />
              {uploadingHeroPhoto ? "上傳中..." : "上傳輪播圖"}
            </Button>
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
          
          <p className="text-xs text-muted-foreground">
            建議尺寸：1920×1080 · 支援 JPG、PNG
          </p>

          {/* 輪播圖列表 */}
          {heroPhotos.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  已上傳的輪播圖
                </p>
                <p className="text-xs text-muted-foreground">
                  拖拽調整順序
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

        {/* 全局設定區塊 */}
        <div className="rounded-lg border-2 bg-gradient-to-br from-muted/30 to-muted/10 p-6 md:p-8 space-y-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-end gap-4 pb-6 border-b">
            {heroPhotos.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                onClick={onPreviewCarousel}
                className="w-full md:w-auto flex items-center justify-center gap-2 h-12 md:h-11 text-base md:text-sm touch-manipulation flex-shrink-0 shadow-sm hover:shadow-md transition-shadow"
              >
                <Eye className="h-5 w-5 md:h-4 md:w-4" />
                預覽輪播效果
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
            {/* 左側：設定表單 */}
            <div className="space-y-8">
              {/* 標題設定 */}
              <div className="space-y-5">
                <div className="flex items-center gap-2 pb-3 border-b border-border/50">
                  <h4 className="font-semibold text-base text-foreground">標題內容</h4>
                </div>
                
                <div className="grid grid-cols-1 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="hero-main-title" className="text-base font-medium">主標題</Label>
                    <Input
                      id="hero-main-title"
                      value={heroMainTitle}
                      onChange={(e) => onHeroTitleChange('hero_main_title', e.target.value)}
                      placeholder="例：歡迎來到我們的民宿"
                      maxLength={20}
                      className="h-12 text-base sm:h-11 sm:text-sm touch-manipulation"
                    />
                    <p className="text-xs text-muted-foreground">
                      {heroMainTitle.length}/20 字元
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="hero-subtitle" className="text-base font-medium">副標題</Label>
                    <Input
                      id="hero-subtitle"
                      value={heroSubtitle}
                      onChange={(e) => onHeroTitleChange('hero_subtitle', e.target.value)}
                      placeholder="例：體驗最舒適的住宿環境"
                      maxLength={20}
                      className="h-12 text-base sm:h-11 sm:text-sm touch-manipulation"
                    />
                    <p className="text-xs text-muted-foreground">
                      {heroSubtitle.length}/20 字元
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="hero-description" className="text-base font-medium">
                      次標題 <span className="text-muted-foreground font-normal text-sm">(選填)</span>
                    </Label>
                    <Input
                      id="hero-description"
                      value={heroDescription}
                      onChange={(e) => onHeroTitleChange('hero_description', e.target.value)}
                      placeholder="例：享受自然與寧靜的完美結合"
                      maxLength={20}
                      className="h-12 text-base sm:h-11 sm:text-sm touch-manipulation"
                    />
                    <p className="text-xs text-muted-foreground">
                      {heroDescription.length}/20 字元
                    </p>
                  </div>
                </div>
              </div>

              {/* 視覺效果設定 */}
              <div className="space-y-5">
                <div className="flex items-center gap-2 pb-3 border-b border-border/50">
                  <h4 className="font-semibold text-base text-foreground">視覺效果</h4>
                </div>
                
                <div className="space-y-5">
                  <div className="space-y-3 p-4 rounded-lg bg-background/50 border">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="hero-overlay-opacity" className="text-base font-medium">背景遮罩</Label>
                      <span className="text-base font-bold text-primary tabular-nums">{heroOverlayOpacity}%</span>
                    </div>
                    <input
                      id="hero-overlay-opacity"
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={heroOverlayOpacity}
                      onChange={(e) => onHeroSettingChange('hero_overlay_opacity', parseInt(e.target.value))}
                      className="w-full h-2.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary transition-all hover:h-3"
                    />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      調整圖片上的黑色遮罩透明度，提升文字可讀性
                    </p>
                  </div>

                  <div className="space-y-3 p-4 rounded-lg bg-background/50 border">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="hero-autoplay-delay" className="text-base font-medium">播放速度</Label>
                      <span className="text-base font-bold text-primary tabular-nums">{heroAutoplayDelay} 秒</span>
                    </div>
                    <input
                      id="hero-autoplay-delay"
                      type="range"
                      min="3"
                      max="15"
                      step="1"
                      value={heroAutoplayDelay}
                      onChange={(e) => onHeroSettingChange('hero_autoplay_delay', parseInt(e.target.value))}
                      className="w-full h-2.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary transition-all hover:h-3"
                    />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      每張輪播圖停留時間，建議 5-10 秒。太短會讓訪客無法完整瀏覽，太長則可能失去注意力
                    </p>
                  </div>
                </div>
              </div>

            </div>

            {/* 右側：即時預覽 */}
            <div className="space-y-4">
              <div className="flex flex-col gap-2 pb-3 border-b border-border/50">
                <Label className="text-base font-semibold">即時預覽</Label>
                <span className="text-sm text-muted-foreground">調整設定即時顯示效果</span>
              </div>
              <div className="relative aspect-video rounded-lg overflow-hidden border-2 shadow-lg bg-muted">
                {heroPhotos.length > 0 ? (
                  <>
                    <img
                      src={heroPhotos[0].photo_url}
                      alt="輪播圖預覽"
                      className="w-full h-full object-cover"
                    />
                    <div 
                      className="absolute inset-0 transition-all duration-300"
                      style={{ 
                        backgroundColor: `rgba(0, 0, 0, ${heroOverlayOpacity / 100})`
                      }}
                    >
                      <div className="flex items-center justify-center absolute inset-0 px-6 py-8 text-center">
                        <div className="w-full space-y-3">
              <div className="space-y-2">
                {heroMainTitle && (
                  <h1 className="text-2xl md:text-3xl font-bold text-white drop-shadow-lg">
                    {heroMainTitle}
                  </h1>
                )}
                {heroSubtitle && (
                  <p className="text-base md:text-lg text-white drop-shadow-md">
                    {heroSubtitle}
                  </p>
                )}
                {heroDescription && (
                  <p className="text-sm text-white/90 drop-shadow-md">
                    {heroDescription}
                  </p>
                )}
              </div>
                          {!heroMainTitle && !heroSubtitle && !heroDescription && (
                            <p className="text-white/60 text-sm">
                              請在左側輸入標題以查看效果
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center space-y-2">
                      <p className="text-muted-foreground text-sm">尚未上傳輪播圖</p>
                      <p className="text-xs text-muted-foreground">請先上傳圖片以查看預覽效果</p>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                此預覽會即時反映您的所有設定變更
              </p>
            </div>
          </div>

          {/* 儲存按鈕 */}
          <SaveButtonContainer 
            onSave={onSave} 
            isSaving={isSaving}
            className="mt-0"
          />
        </div>

      </CardContent>
    </Card>
  );
};
