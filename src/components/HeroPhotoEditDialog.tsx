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
    title?: string | null;
    subtitle?: string | null;
    secondary_subtitle?: string | null;
    text_color?: string | null;
    text_size?: string | null;
    title_size?: string | null;
    subtitle_size?: string | null;
    secondary_subtitle_size?: string | null;
    text_position_x?: string | null;
    text_position_y?: string | null;
    overlay_opacity?: number | null;
    autoplay_delay?: number | null;
  } | null;
  onSave: (photoId: string, data: {
    title: string;
    subtitle: string;
    secondary_subtitle: string;
    text_color: string;
    text_size: string;
    title_size: string;
    subtitle_size: string;
    secondary_subtitle_size: string;
    text_position_x: string;
    text_position_y: string;
    overlay_opacity: number;
    autoplay_delay: number;
  }) => Promise<void>;
}

export const HeroPhotoEditDialog = ({ open, onOpenChange, photo, onSave }: HeroPhotoEditDialogProps) => {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [secondarySubtitle, setSecondarySubtitle] = useState("");
  const [textColor, setTextColor] = useState("white");
  const [textSize, setTextSize] = useState("medium");
  const [titleSize, setTitleSize] = useState("large");
  const [subtitleSize, setSubtitleSize] = useState("medium");
  const [secondarySubtitleSize, setSecondarySubtitleSize] = useState("small");
  const [textPositionX, setTextPositionX] = useState("center");
  const [textPositionY, setTextPositionY] = useState("center");
  const [overlayOpacity, setOverlayOpacity] = useState(40);
  const [autoplayDelay, setAutoplayDelay] = useState(8);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (photo) {
      setTitle(photo.title || "");
      setSubtitle(photo.subtitle || "");
      setSecondarySubtitle(photo.secondary_subtitle || "");
      setTextColor(photo.text_color || "white");
      setTextSize(photo.text_size || "medium");
      setTitleSize(photo.title_size || "large");
      setSubtitleSize(photo.subtitle_size || "medium");
      setSecondarySubtitleSize(photo.secondary_subtitle_size || "small");
      setTextPositionX(photo.text_position_x || "center");
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
        title,
        subtitle,
        secondary_subtitle: secondarySubtitle,
        text_color: textColor,
        text_size: textSize,
        title_size: titleSize,
        subtitle_size: subtitleSize,
        secondary_subtitle_size: secondarySubtitleSize,
        text_position_x: textPositionX,
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
          <DialogTitle>編輯輪播圖文字與樣式</DialogTitle>
          <DialogDescription>
            設置此輪播圖的標題、副標題和視覺效果
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
                      photo.text_position_y === 'top' ? 'flex items-start justify-center pt-8' :
                      photo.text_position_y === 'bottom' ? 'flex items-end justify-center pb-8' :
                      'flex items-center justify-center'
                    }
                    absolute inset-0
                  `}
                  style={{
                    color: textColor === 'black' ? '#000' : textColor === 'primary' ? 'hsl(var(--primary))' : '#fff'
                  }}
                >
                  <div className="w-full">
                    {title && (
                      <h1 
                        className={`
                          font-bold drop-shadow-lg
                          ${titleSize === 'small' ? 'text-xl md:text-3xl' : 
                            titleSize === 'large' ? 'text-3xl md:text-5xl' : 
                            'text-2xl md:text-4xl'}
                        `}
                      >
                        {title}
                      </h1>
                    )}
                    {subtitle && (
                      <p 
                        className={`
                          drop-shadow-lg mt-2
                          ${subtitleSize === 'small' ? 'text-sm md:text-base' : 
                            subtitleSize === 'large' ? 'text-lg md:text-2xl' : 
                            'text-base md:text-xl'}
                        `}
                      >
                        {subtitle}
                      </p>
                    )}
                    {secondarySubtitle && (
                      <p 
                        className={`
                          drop-shadow-lg mt-1 opacity-90
                          ${secondarySubtitleSize === 'small' ? 'text-xs md:text-sm' : 
                            secondarySubtitleSize === 'large' ? 'text-base md:text-xl' : 
                            'text-sm md:text-lg'}
                        `}
                      >
                        {secondarySubtitle}
                      </p>
                    )}
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
            {/* 標題 */}
            <div className="space-y-2">
              <Label htmlFor="title">標題</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例：歡迎來到我們的民宿"
                maxLength={20}
              />
              <p className="text-sm text-muted-foreground">
                {title.length}/20 字元
              </p>
            </div>

            {/* 副標題 */}
            <div className="space-y-2">
              <Label htmlFor="subtitle">副標題</Label>
              <Input
                id="subtitle"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="例：體驗最舒適的住宿環境"
                maxLength={20}
              />
              <p className="text-sm text-muted-foreground">
                {subtitle.length}/20 字元
              </p>
            </div>

            {/* 次標題 */}
            <div className="space-y-2">
              <Label htmlFor="secondary-subtitle">次標題（選填）</Label>
              <Input
                id="secondary-subtitle"
                value={secondarySubtitle}
                onChange={(e) => setSecondarySubtitle(e.target.value)}
                placeholder="例：享受自然與寧靜的完美結合"
                maxLength={20}
              />
              <p className="text-sm text-muted-foreground">
                {secondarySubtitle.length}/20 字元
              </p>
            </div>

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
