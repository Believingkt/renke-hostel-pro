import { useState, useCallback } from "react";
import Cropper, { Area } from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut, Info } from "lucide-react";

interface OgImageCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageSrc: string;
  onCropComplete: (croppedImage: Blob) => void;
}

export const OgImageCropDialog = ({
  open,
  onOpenChange,
  imageSrc,
  onCropComplete,
}: OgImageCropDialogProps) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropChange = (location: { x: number; y: number }) => {
    setCrop(location);
  };

  const onZoomChange = (zoom: number) => {
    setZoom(zoom);
  };

  const onCropAreaChange = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createCroppedImage = async (): Promise<Blob> => {
    if (!croppedAreaPixels) {
      throw new Error("No crop area defined");
    }

    return new Promise((resolve, reject) => {
      const image = new Image();
      image.src = imageSrc;
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Set canvas size to the recommended OG image size
        const targetWidth = 1200;
        const targetHeight = 630;
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        // Draw the cropped image scaled to fit the target size
        ctx.drawImage(
          image,
          croppedAreaPixels.x,
          croppedAreaPixels.y,
          croppedAreaPixels.width,
          croppedAreaPixels.height,
          0,
          0,
          targetWidth,
          targetHeight
        );

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Canvas toBlob failed"));
            }
          },
          "image/webp",
          0.95
        );
      };
      image.onerror = () => reject(new Error("Failed to load image"));
    });
  };

  const handleSave = async () => {
    if (!croppedAreaPixels) return;

    try {
      setIsProcessing(true);
      const croppedImage = await createCroppedImage();
      onCropComplete(croppedImage);
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating cropped image:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>裁切社群分享縮圖</DialogTitle>
          <DialogDescription>
            調整圖片的顯示區域，確保重要內容不會被裁切。裁切後的圖片將自動轉換為 WebP 格式並調整為 1200 x 630 像素。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 relative bg-muted rounded-lg overflow-hidden" style={{ minHeight: "400px" }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1200 / 630}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropAreaChange={onCropAreaChange}
            objectFit="contain"
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <ZoomOut className="h-4 w-4 text-muted-foreground" />
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.1}
              onValueChange={(value) => setZoom(value[0])}
              className="flex-1"
            />
            <ZoomIn className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground min-w-[60px]">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          <div className="flex items-start gap-2 p-3 bg-primary/5 rounded-md border border-primary/20">
            <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">裁切提示</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>拖曳圖片來調整位置</li>
                <li>使用滑桿來縮放圖片</li>
                <li>裁切框比例固定為 1200:630（1.9:1）以符合社群媒體標準</li>
                <li>確保主要內容位於裁切框的中央區域</li>
              </ul>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isProcessing}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isProcessing}>
            {isProcessing ? "處理中..." : "確認裁切"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
