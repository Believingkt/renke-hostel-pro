import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface HeroPhotoEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photo: {
    id: string;
    photo_url: string;
  } | null;
  onSave: (photoId: string, data: {}) => Promise<void>;
}

export const HeroPhotoEditDialog = ({ open, onOpenChange, photo, onSave }: HeroPhotoEditDialogProps) => {
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!photo) return;

    setIsSaving(true);
    try {
      await onSave(photo.id, {});
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (!photo) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>編輯輪播圖顯示設定</DialogTitle>
          <DialogDescription>
            調整此輪播圖的顯示設定（標題內容、文字樣式、背景遮罩透明度和自動播放時間請至輪播圖設定區域統一編輯）
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 圖片預覽 */}
          <div className="space-y-2">
            <Label>圖片預覽</Label>
            <div className="relative aspect-video rounded-lg overflow-hidden border bg-muted">
              <img
                src={photo.photo_url}
                alt="輪播圖預覽"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40">
                <div className="flex items-center justify-center absolute inset-0 px-4 py-8 text-center">
                  <div className="w-full">
                    <p className="text-sm text-white/80">
                      標題將顯示在此處（請至輪播圖設定區域編輯全局標題和樣式）
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <p className="text-sm text-muted-foreground">
            目前此對話框僅供預覽使用。如需調整文字樣式、顏色、位置等設定，請至輪播圖設定區域進行統一編輯。
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "儲存中..." : "儲存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
