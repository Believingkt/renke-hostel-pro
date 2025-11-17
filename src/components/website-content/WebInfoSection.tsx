import { useState } from "react";
import { Upload, Info, Trash2, GripVertical } from "lucide-react";
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
  onUpdate: () => void;
  onHeroPhotoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteHeroPhoto: (photoId: string) => void;
  onHeroPhotoReorder: (newOrder: any[]) => void;
  onEditHeroPhoto: (photo: any) => void;
  uploadingHeroPhoto: boolean;
}

interface SortablePhotoProps {
  photo: any;
  onDelete: (photoId: string) => void;
  onEdit: (photo: any) => void;
}

const SortablePhoto = ({ photo, onDelete, onEdit }: SortablePhotoProps) => {
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
        className="aspect-video rounded-lg overflow-hidden border bg-muted cursor-pointer"
        onClick={() => onEdit(photo)}
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
        onClick={(e) => e.stopPropagation()}
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
  onUpdate,
  onHeroPhotoUpload,
  onDeleteHeroPhoto,
  onHeroPhotoReorder,
  onEditHeroPhoto,
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
      <CardContent className="space-y-6">
        {/* 首頁主視覺輪播圖 */}
        <div className="space-y-4">
          <Label>首頁主視覺輪播圖</Label>
          
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => document.getElementById('hero-photo-upload')?.click()}
              disabled={uploadingHeroPhoto || heroPhotos.length >= 5}
              className="flex items-center gap-2"
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
            <span className="text-sm text-muted-foreground">
              已上傳 {heroPhotos.length}/5 張
            </span>
          </div>
          
          <p className="text-sm text-muted-foreground">
            建議尺寸：1920x1080 像素，支援 JPG、PNG 格式，上傳後自動優化為 WebP
          </p>

          {/* 輪播圖列表 */}
          {heroPhotos.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                拖拽圖片可調整輪播順序
              </p>
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
                          onEdit={onEditHeroPhoto}
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
