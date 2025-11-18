import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import type { CarouselApi } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

interface HeroPhoto {
  id: string;
  photo_url: string;
  title?: string | null;
  subtitle?: string | null;
  text_color?: string | null;
  text_size?: string | null;
  text_position_x?: string | null;
  text_position_y?: string | null;
  overlay_opacity?: number | null;
  autoplay_delay?: number | null;
}

interface HeroCarouselPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: HeroPhoto[];
}

export const HeroCarouselPreviewDialog = ({ open, onOpenChange, photos }: HeroCarouselPreviewDialogProps) => {
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);
  const [autoplayPlugin] = useState(() => 
    Autoplay({ 
      delay: 8000,
      stopOnInteraction: false,
      stopOnMouseEnter: false,
    })
  );

  useEffect(() => {
    if (!carouselApi) return;

    const updateCurrent = () => {
      setCurrent(carouselApi.selectedScrollSnap());
    };

    carouselApi.on("select", updateCurrent);
    updateCurrent();

    return () => {
      carouselApi.off("select", updateCurrent);
    };
  }, [carouselApi]);

  // 更新自動播放延遲
  useEffect(() => {
    if (!carouselApi || photos.length === 0) return;
    
    const currentPhoto = photos[current];
    const delay = (currentPhoto?.autoplay_delay ?? 8) * 1000;
    
    if (autoplayPlugin && autoplayEnabled) {
      autoplayPlugin.reset();
      // @ts-ignore - Autoplay plugin has options property
      autoplayPlugin.options.delay = delay;
    }
  }, [current, photos, autoplayPlugin, autoplayEnabled, carouselApi]);

  const toggleAutoplay = () => {
    if (!autoplayPlugin) return;

    if (autoplayEnabled) {
      autoplayPlugin.stop();
    } else {
      autoplayPlugin.play();
    }
    setAutoplayEnabled(!autoplayEnabled);
  };

  const scrollPrev = () => {
    carouselApi?.scrollPrev();
  };

  const scrollNext = () => {
    carouselApi?.scrollNext();
  };

  if (photos.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>輪播圖預覽</DialogTitle>
          </DialogHeader>
          <div className="p-6 text-center text-muted-foreground">
            尚未上傳輪播圖片
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl p-0 gap-0">
        <DialogHeader className="p-6 pb-3">
          <DialogTitle>輪播圖預覽</DialogTitle>
        </DialogHeader>
        
        <div className="relative">
          <Carousel
            opts={{
              align: "start",
              loop: true,
            }}
            plugins={autoplayEnabled ? [autoplayPlugin] : []}
            setApi={setCarouselApi}
            className="w-full"
          >
            <CarouselContent>
              {photos.map((photo) => (
                <CarouselItem key={photo.id}>
                  <div className="relative aspect-[21/9] w-full overflow-hidden bg-muted">
                    {/* 背景圖片 */}
                    <img
                      src={photo.photo_url}
                      alt="輪播圖"
                      className="h-full w-full object-cover"
                    />
                    
                    {/* 遮罩層與文字內容 */}
                    <div 
                      className="absolute inset-0 transition-all duration-300"
                      style={{ 
                        backgroundColor: `rgba(0, 0, 0, ${(photo.overlay_opacity ?? 40) / 100})`
                      }}
                    >
                      <div 
                        className={`
                          space-y-2 px-4 py-8
                          ${photo.text_position_x === 'left' ? 'text-left' : photo.text_position_x === 'right' ? 'text-right' : 'text-center'}
                          ${
                            photo.text_position_y === 'top' ? 'flex items-start justify-center pt-8' :
                            photo.text_position_y === 'bottom' ? 'flex items-end justify-center pb-8' :
                            'flex items-center justify-center'
                          }
                          absolute inset-0
                        `}
                        style={{
                          color: photo.text_color === 'black' ? '#000' : photo.text_color === 'primary' ? 'hsl(var(--primary))' : '#fff'
                        }}
                      >
                        <div className="w-full max-w-4xl px-4">
                          {photo.title && (
                            <h1 
                              className={`
                                font-bold drop-shadow-lg animate-fade-in
                                ${photo.text_size === 'small' ? 'text-2xl md:text-4xl' : 
                                  photo.text_size === 'large' ? 'text-4xl md:text-6xl' : 
                                  'text-3xl md:text-5xl'}
                              `}
                            >
                              {photo.title}
                            </h1>
                          )}
                          {photo.subtitle && (
                            <p 
                              className={`
                                drop-shadow-lg mt-3 animate-fade-in
                                ${photo.text_size === 'small' ? 'text-base md:text-lg' : 
                                  photo.text_size === 'large' ? 'text-xl md:text-3xl' : 
                                  'text-lg md:text-2xl'}
                              `}
                              style={{ animationDelay: '0.2s' }}
                            >
                              {photo.subtitle}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          {/* 左右切換按鈕 */}
          {photos.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-background/80 hover:bg-background/90 backdrop-blur-sm"
                onClick={scrollPrev}
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-background/80 hover:bg-background/90 backdrop-blur-sm"
                onClick={scrollNext}
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
            </>
          )}

          {/* 控制列 */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-background/90 backdrop-blur-sm rounded-full px-4 py-2">
            {/* 播放/暫停按鈕 */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={toggleAutoplay}
            >
              {autoplayEnabled ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>

            {/* 指示點 */}
            <div className="flex gap-2">
              {photos.map((_, index) => (
                <button
                  key={index}
                  className={`h-2 rounded-full transition-all ${
                    index === current
                      ? 'w-6 bg-primary'
                      : 'w-2 bg-primary/30 hover:bg-primary/50'
                  }`}
                  onClick={() => carouselApi?.scrollTo(index)}
                  aria-label={`前往第 ${index + 1} 張圖片`}
                />
              ))}
            </div>

            {/* 頁面計數 */}
            <div className="text-sm text-muted-foreground">
              {current + 1} / {photos.length}
            </div>
          </div>
        </div>

        <div className="p-6 pt-3">
          <p className="text-sm text-muted-foreground text-center">
            此預覽展示了實際的輪播效果，包含自動播放、文字疊加和切換動畫
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
