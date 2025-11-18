import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

interface HeroPhotoEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photo: {
    id: string;
    photo_url: string;
    text_color?: string | null;
    text_position_y?: string | null;
    overlay_opacity?: number | null;
    autoplay_delay?: number | null;
  } | null;
  onSave: (photoId: string, data: {
    text_color: string;
    text_position_y: string;
    overlay_opacity: number;
    autoplay_delay: number;
  }) => Promise<void>;
}

export const HeroPhotoEditDialog = ({ open, onOpenChange, photo, onSave }: HeroPhotoEditDialogProps) => {
  const [textColor, setTextColor] = useState("white");
  const [textPositionY, setTextPositionY] = useState("center");
  const [overlayOpacity, setOverlayOpacity] = useState(40);
  const [autoplayDelay, setAutoplayDelay] = useState(8);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (photo) {
      setTextColor(photo.text_color || "white");
      setTextPositionY(photo.text_position_y || "center");
      setOverlayOpacity(photo.overlay_opacity ?? 40);
      setAutoplayDelay(photo.autoplay_delay ?? 8);
    }
  }, [photo]);

  const handleSave = async () => {
    if (!photo) return;

    setIsSaving(true);
    try {
      await onSave(photo.id, {
        text_color: textColor,
        text_position_y: textPositionY,
        overlay_opacity: overlayOpacity,
        autoplay_delay: autoplayDelay,
      });
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
            調整此輪播圖的文字顏色、位置、遮罩透明度和自動播放延遲（標題內容請至輪播圖設定區域統一編輯）
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左側：即時預覽 */}
          <div className="space-y-2">
            <Label>即時預覽</Label>
            <div className="relative aspect-video rounded-lg overflow-hidden border bg-muted">
              <img
                src={photo.photo_url}
                alt="輪播圖預覽"
                className="w-full h-full object-cover"
              />
              <div 
                className="absolute inset-0 transition-all duration-300"
                style={{ 
                  backgroundColor: `rgba(0, 0, 0, ${overlayOpacity / 100})`
                }}
              >
                <div 
                  className={`
                    space-y-2 px-4 py-8
                    text-center
                    ${
                      textPositionY === 'top' ? 'flex items-start justify-center pt-8' :
                      textPositionY === 'bottom' ? 'flex items-end justify-center pb-8' :
                      'flex items-center justify-center'
                    }
                    absolute inset-0
                  `}
                  style={{
                    color: textColor === 'black' ? '#000' : textColor === 'primary' ? 'hsl(var(--primary))' : '#fff'
                  }}
                >
                  <div className="w-full">
                    <p className="text-sm text-muted-foreground">
                      標題將顯示在此處（請至輪播圖設定區域編輯全局標題）
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              此預覽會即時反映您的所有設定變更
            </p>
          </div>

          {/* 右側：設定表單 */}
          <div className="space-y-4">
            {/* 文字顏色 */}
            <div className="space-y-2">
              <Label htmlFor="text-color">文字顏色</Label>
              <Select value={textColor} onValueChange={setTextColor}>
                <SelectTrigger id="text-color">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="white">白色</SelectItem>
                  <SelectItem value="black">黑色</SelectItem>
                  <SelectItem value="primary">主題色</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 垂直位置 */}
            <div className="space-y-2">
              <Label htmlFor="text-position-y">垂直位置</Label>
              <Select value={textPositionY} onValueChange={setTextPositionY}>
                <SelectTrigger id="text-position-y">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="top">上</SelectItem>
                  <SelectItem value="center">中</SelectItem>
                  <SelectItem value="bottom">下</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 背景遮罩透明度 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="overlay-opacity">背景遮罩透明度</Label>
                <span className="text-sm text-muted-foreground">{overlayOpacity}%</span>
              </div>
              <Slider
                id="overlay-opacity"
                min={0}
                max={100}
                step={5}
                value={[overlayOpacity]}
                onValueChange={(value) => setOverlayOpacity(value[0])}
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">
                調整圖片暗化效果強度（0% = 無遮罩，100% = 完全黑色）
              </p>
            </div>

            {/* 自動播放時間 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="autoplay-delay">自動播放時間</Label>
                <span className="text-sm text-muted-foreground">{autoplayDelay} 秒</span>
              </div>
              <Slider
                id="autoplay-delay"
                min={2}
                max={20}
                step={1}
                value={[autoplayDelay]}
                onValueChange={(value) => setAutoplayDelay(value[0])}
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">
                設定此圖片在輪播時的停留時間（2-20 秒）
              </p>
            </div>
          </div>
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
