import { useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageViewerPortalProps {
  imageUrl: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export const ImageViewerPortal = ({ imageUrl, onClose, onPrev, onNext }: ImageViewerPortalProps) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onPrev, onNext]);

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-none w-screen h-screen p-0 bg-black/95 border-0 [&>button]:hidden"
      >
        <div className="relative w-full h-full flex items-center justify-center">
          {/* 圖片 */}
          <img
            src={imageUrl}
            alt="查看照片"
            className="max-w-[90vw] max-h-[80vh] object-contain select-none"
            draggable={false}
          />

          {/* 關閉按鈕 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute top-4 right-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white"
          >
            <X className="w-6 h-6" />
          </Button>

          {/* 上一張 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onPrev}
            className="absolute left-6 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white"
          >
            <ChevronLeft className="w-7 h-7" />
          </Button>

          {/* 下一張 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onNext}
            className="absolute right-6 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white"
          >
            <ChevronRight className="w-7 h-7" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
