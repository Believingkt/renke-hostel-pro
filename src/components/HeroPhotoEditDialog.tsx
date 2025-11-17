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
    cta_text?: string | null;
    cta_link?: string | null;
    text_color?: string | null;
    text_size?: string | null;
    text_position_x?: string | null;
    text_position_y?: string | null;
    overlay_opacity?: number | null;
  } | null;
  onSave: (photoId: string, data: {
    title: string;
    subtitle: string;
    cta_text: string;
    cta_link: string;
    text_color: string;
    text_size: string;
    text_position_x: string;
    text_position_y: string;
    overlay_opacity: number;
  }) => Promise<void>;
}

export const HeroPhotoEditDialog = ({ open, onOpenChange, photo, onSave }: HeroPhotoEditDialogProps) => {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaLink, setCtaLink] = useState("");
  const [textColor, setTextColor] = useState("white");
  const [textSize, setTextSize] = useState("medium");
  const [textPositionX, setTextPositionX] = useState("center");
  const [textPositionY, setTextPositionY] = useState("center");
  const [overlayOpacity, setOverlayOpacity] = useState(40);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (photo) {
      setTitle(photo.title || "");
      setSubtitle(photo.subtitle || "");
      setCtaText(photo.cta_text || "");
      setCtaLink(photo.cta_link || "");
      setTextColor(photo.text_color || "white");
      setTextSize(photo.text_size || "medium");
      setTextPositionX(photo.text_position_x || "center");
      setTextPositionY(photo.text_position_y || "center");
      setOverlayOpacity(photo.overlay_opacity ?? 40);
    }
  }, [photo]);

  const handleSave = async () => {
    if (!photo) return;

    setIsSaving(true);
    try {
      await onSave(photo.id, {
        title,
        subtitle,
        cta_text: ctaText,
        cta_link: ctaLink,
        text_color: textColor,
        text_size: textSize,
        text_position_x: textPositionX,
        text_position_y: textPositionY,
        overlay_opacity: overlayOpacity,
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (!photo) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>編輯輪播圖文字</DialogTitle>
          <DialogDescription>
            設置此輪播圖的標題、副標題和行動呼籲按鈕
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 圖片預覽 */}
          <div className="relative w-full h-48 rounded-lg overflow-hidden border">
            <img
              src={photo.photo_url}
              alt="輪播圖預覽"
              className="w-full h-full object-cover"
            />
          </div>

          {/* 標題 */}
          <div className="space-y-2">
            <Label htmlFor="title">標題</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：歡迎來到我們的民宿"
              maxLength={100}
            />
            <p className="text-sm text-muted-foreground">
              {title.length}/100 字元
            </p>
          </div>

          {/* 副標題 */}
          <div className="space-y-2">
            <Label htmlFor="subtitle">副標題</Label>
            <Textarea
              id="subtitle"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="例：體驗最舒適的住宿環境"
              maxLength={200}
              rows={3}
            />
            <p className="text-sm text-muted-foreground">
              {subtitle.length}/200 字元
            </p>
          </div>

          {/* CTA 按鈕文字 */}
          <div className="space-y-2">
            <Label htmlFor="cta-text">按鈕文字（選填）</Label>
            <Input
              id="cta-text"
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              placeholder="例：立即預訂、了解更多"
              maxLength={50}
            />
            <p className="text-sm text-muted-foreground">
              {ctaText.length}/50 字元
            </p>
          </div>

          {/* CTA 按鈕連結 */}
          <div className="space-y-2">
            <Label htmlFor="cta-link">按鈕連結（選填）</Label>
            <Input
              id="cta-link"
              value={ctaLink}
              onChange={(e) => setCtaLink(e.target.value)}
              placeholder="例：/booking 或 #rooms"
              maxLength={200}
            />
            <p className="text-sm text-muted-foreground">
              可以使用相對路徑（如 /booking）或錨點（如 #rooms）
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

          {/* 文字大小 */}
          <div className="space-y-2">
            <Label htmlFor="text-size">文字大小</Label>
            <Select value={textSize} onValueChange={setTextSize}>
              <SelectTrigger id="text-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">小</SelectItem>
                <SelectItem value="medium">中</SelectItem>
                <SelectItem value="large">大</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 水平位置 */}
          <div className="space-y-2">
            <Label htmlFor="text-position-x">水平位置</Label>
            <Select value={textPositionX} onValueChange={setTextPositionX}>
              <SelectTrigger id="text-position-x">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">左</SelectItem>
                <SelectItem value="center">中</SelectItem>
                <SelectItem value="right">右</SelectItem>
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
