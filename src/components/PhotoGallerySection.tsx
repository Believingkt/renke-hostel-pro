import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";

interface Photo {
  id: string;
  photo_url: string;
  display_order: number;
}

interface PhotoGallerySectionProps {
  photos: Photo[];
}

const PhotoGallerySection = ({ photos }: PhotoGallerySectionProps) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

  if (!photos || photos.length === 0) {
    return null;
  }

  const sortedPhotos = [...photos].sort((a, b) => a.display_order - b.display_order);

  const handlePrevImage = () => {
    if (selectedImageIndex !== null) {
      setSelectedImageIndex((selectedImageIndex - 1 + sortedPhotos.length) % sortedPhotos.length);
    }
  };

  const handleNextImage = () => {
    if (selectedImageIndex !== null) {
      setSelectedImageIndex((selectedImageIndex + 1) % sortedPhotos.length);
    }
  };

  return (
    <section id="gallery" className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">相簿</h2>
          <p className="text-muted-foreground">探索更多精彩瞬間</p>
        </div>

        <div className="max-w-7xl mx-auto bg-card rounded-2xl shadow-lg p-6 md:p-8 border border-border/50">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {sortedPhotos.map((photo, index) => {
            // 創造不規則的尺寸模式，讓排版更活潑
            const isLarge = index % 7 === 0 || index % 11 === 0;
            const gridSpan = isLarge ? "md:col-span-2 md:row-span-2" : "";
            
            return (
              <div
                key={photo.id}
                className={`relative overflow-hidden rounded-xl cursor-pointer group animate-fade-in ${gridSpan}`}
                style={{ 
                  aspectRatio: isLarge ? "1" : "1",
                  animationDelay: `${index * 50}ms`
                }}
                onClick={() => setSelectedImageIndex(index)}
              >
                <img
                  src={photo.photo_url}
                  alt={`相簿照片 ${index + 1}`}
                  className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110 group-hover:rotate-1"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute inset-0 ring-2 ring-primary/0 group-hover:ring-primary/50 transition-all duration-300 rounded-xl" />
              </div>
            );
          })}
          </div>
        </div>

        <Dialog open={selectedImageIndex !== null} onOpenChange={() => setSelectedImageIndex(null)}>
          <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-background/95 backdrop-blur-sm border-none">
            <DialogClose className="absolute right-4 top-4 z-50 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
              <X className="h-6 w-6 text-white drop-shadow-lg" />
              <span className="sr-only">關閉</span>
            </DialogClose>
            <div className="relative w-full h-full flex items-center justify-center">
              {selectedImageIndex !== null && (
                <>
                  <img
                    src={sortedPhotos[selectedImageIndex].photo_url}
                    alt={`相簿照片 ${selectedImageIndex + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white"
                    onClick={handlePrevImage}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white"
                    onClick={handleNextImage}
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-4 py-2 rounded-full text-sm">
                    {selectedImageIndex + 1} / {sortedPhotos.length}
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
};

export default PhotoGallerySection;